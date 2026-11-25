// Social Export — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// The Share window: the photos on the left (with alt text, when posting), the
// destination, its account and the post on the right, and the actions.

import { BLUESKY, BORDERS, type BorderId, DEFAULT_DESTINATION, DESTINATIONS, type Destination, type Fit, SETTINGS, destinationById } from "./config";
import type { createBluesky } from "./bluesky";
import type { createFediverse } from "./mastodon";
import type { Poster, Visibility } from "./poster";
import { graphemeCount } from "./richtext";
import { React } from "./rt";
import type { CatalogPhoto, SafelightAPI } from "./safelight";
import type { Saver } from "./save";
import type { Action, Sharer } from "./share";

type Bluesky = ReturnType<typeof createBluesky>;
type Fediverse = ReturnType<typeof createFediverse>;

export interface WindowServices {
  api: SafelightAPI;
  sharer: Sharer;
  saver: Saver;
  bluesky: Bluesky;
  mastodon: Fediverse;
  pixelfed: Fediverse;
  /** The photos the window was opened for, or null for the target photos. */
  pinned: { getState(): { ids: string[] | null }; <U>(selector: (s: { ids: string[] | null }) => U): U };
}

const VISIBILITIES: { value: Visibility; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "private", label: "Followers only" },
];

const restricted = (d: Destination) => d.minAspect > 0 || Number.isFinite(d.maxAspect);
const clampAspect = (d: Destination, a: number) => Math.min(d.maxAspect, Math.max(d.minAspect, a));

function useSetting<T>(api: SafelightAPI, key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = React.useState<T>(() => api.settings.get<T>(key, fallback));
  const set = React.useCallback(
    (v: T) => {
      setValue(v);
      api.settings.set(key, v);
    },
    [api, key],
  );
  return [value, set];
}

export function createShareWindow(s: WindowServices) {
  const { api } = s;
  const { Button, Select, TextInput, TextArea, SegmentedControl, Section, Stack, Row, ProgressBar, tokens } = api.ui;
  const note: React.CSSProperties = { margin: 0, fontSize: 11, lineHeight: 1.45, color: tokens.textSecondary };
  const muted: React.CSSProperties = { ...note, color: tokens.textMuted };

  function usePhotos(): CatalogPhoto[] {
    const pinned = s.pinned((p) => p.ids);
    const all = api.stores.useCatalogStore((c) => c.photos);
    const selected = api.stores.useCatalogStore((c) => c.selectedIds);
    const active = api.catalog.useActivePhoto();
    return React.useMemo(() => {
      // The photos a command acts on: the selection, else the active photo.
      const wanted = new Set(pinned ?? (selected.size ? selected : active ? [active.id] : []));
      return all.filter((p) => wanted.has(p.id));
    }, [pinned, selected, active, all]);
  }

  function Preview({ photo, dest, fit, border }: { photo: CatalogPhoto; dest: Destination; fit: Fit; border: string }) {
    const [aspect, setAspect] = React.useState(photo.width && photo.height ? photo.width / photo.height : 1.5);
    React.useEffect(() => {
      if (!photo.thumbnailUrl) api.catalog.requestThumbnail(photo.id);
    }, [photo.id, photo.thumbnailUrl]);
    const frame = clampAspect(dest, aspect);
    const box = frame >= 1 ? { width: 72, height: 72 / frame } : { width: 72 * frame, height: 72 };
    return (
      <div
        title={restricted(dest) ? `As ${dest.service} will show it` : undefined}
        style={{ ...box, flex: "none", background: fit === "border" ? border : tokens.surface2, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", outline: `1px solid ${tokens.borderSubtle}` }}
      >
        {photo.thumbnailUrl ? (
          <img
            src={photo.thumbnailUrl}
            alt=""
            onLoad={(e) => e.currentTarget.naturalHeight && setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
            style={{ width: "100%", height: "100%", objectFit: fit === "crop" ? "cover" : "contain" }}
          />
        ) : null}
      </div>
    );
  }

  function BlueskyAccount() {
    const account = s.bluesky.store((a) => a);
    const [handle, setHandle] = React.useState("");
    const [password, setPassword] = React.useState("");
    const [provider, setProvider] = React.useState<string>(BLUESKY.defaultProvider);
    if (account.status === "signed-in") return <SignedIn name={account.name} remembered={account.remembered} onSignOut={() => void s.bluesky.signOut()} />;
    const busy = account.status === "signing-in";
    const submit = () => {
      if (busy || !handle.trim() || !password.trim()) return;
      void s.bluesky.signIn(handle, password, provider.trim() || BLUESKY.defaultProvider).then(() => setPassword(""));
    };
    return (
      <Stack gap={6}>
        {account.message ? <p style={note}>{account.message}</p> : null}
        <TextInput aria-label="Bluesky handle" placeholder="Handle, such as you.bsky.social" value={handle} onChange={setHandle} disabled={busy} />
        <TextInput
          aria-label="App password"
          type="password"
          placeholder="App password"
          title="Make one in Bluesky ▸ Settings ▸ Privacy and security ▸ App passwords. It can post for you but can't change your account."
          value={password}
          onChange={setPassword}
          disabled={busy}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <TextInput aria-label="Hosting provider" title="Where your account is hosted. Leave it as it is unless you run your own server." value={provider} onChange={setProvider} disabled={busy} />
        <Row gap={6}>
          <Button variant="primary" disabled={busy || !handle.trim() || !password.trim()} onClick={submit}>
            Sign in
          </Button>
          <Button variant="ghost" onClick={() => window.open(BLUESKY.appPasswords, "_blank")}>
            Make an app password
          </Button>
        </Row>
      </Stack>
    );
  }

  function FediverseAccount({ service, example }: { service: Fediverse; example: string }) {
    const account = service.store((a) => a);
    const [server, setServer] = React.useState("");
    if (account.status === "signed-in") return <SignedIn name={account.name} remembered={account.remembered} onSignOut={() => void service.signOut()} />;
    if (account.status === "signing-in")
      return (
        <Row justify="space-between" align="center" gap={6}>
          <p style={note}>Finish signing in in your browser.</p>
          <Button size="sm" onClick={service.cancelSignIn}>
            Cancel
          </Button>
        </Row>
      );
    const submit = () => {
      if (server.trim()) void service.signIn(server);
    };
    return (
      <Stack gap={6}>
        {account.message ? <p style={note}>{account.message}</p> : null}
        <Row gap={6}>
          <div style={{ flex: 1 }}>
            <TextInput aria-label="Server" placeholder={`Your server, such as ${example}`} value={server} onChange={setServer} onKeyDown={(e) => e.key === "Enter" && submit()} />
          </div>
          <Button variant="primary" disabled={!server.trim()} onClick={submit} title="Opens your server's sign-in page in your browser">
            Sign in
          </Button>
        </Row>
      </Stack>
    );
  }

  function SignedIn({ name, remembered, onSignOut }: { name: string; remembered: boolean; onSignOut: () => void }) {
    return (
      <Stack gap={4}>
        <Row justify="space-between" align="center" gap={6}>
          <span style={{ fontSize: 12, color: tokens.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          <Button size="sm" variant="ghost" onClick={onSignOut}>
            Sign out
          </Button>
        </Row>
        {remembered ? null : <p style={muted}>This computer has no keychain to keep the sign-in, so it lasts until Safelight closes.</p>}
      </Stack>
    );
  }

  function posterFor(dest: Destination): Poster | null {
    if (dest.delivery.kind !== "post") return null;
    return s[dest.delivery.service];
  }

  function useLimit(poster: Poster | null, signedIn: boolean): number | null {
    const [limit, setLimit] = React.useState<number | null>(null);
    React.useEffect(() => {
      let live = true;
      setLimit(null);
      if (poster && signedIn) void poster.limits().then((l) => live && setLimit(l.maxText)).catch(() => {});
      return () => {
        live = false;
      };
    }, [poster, signedIn]);
    return limit;
  }

  function FolderRow() {
    const [name, setName] = React.useState<string | null>(null);
    const last = s.sharer.store((st) => st.last);
    React.useEffect(() => {
      let live = true;
      void s.saver.folderName().then((n) => live && setName(n));
      return () => {
        live = false;
      };
    }, [last]);
    return (
      <Row justify="space-between" align="center" gap={6}>
        <span style={{ ...note, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title="Where saved photos go">
          {name ? `Saves to ${name}` : "You'll choose a folder the first time you save."}
        </span>
        <Button size="sm" variant="ghost" onClick={() => void s.saver.choose().then((f) => f && setName(f.name))}>
          {name ? "Change folder" : "Choose folder"}
        </Button>
      </Row>
    );
  }

  return function ShareWindow() {
    const photos = usePhotos();
    const [destId, setDestId] = useSetting(api, SETTINGS.destination, DEFAULT_DESTINATION);
    const [fit, setFit] = useSetting<Fit>(api, SETTINGS.fit, "border");
    const [borderId, setBorderId] = useSetting<BorderId>(api, SETTINGS.border, "white");
    const [visibility, setVisibility] = useSetting<Visibility>(api, SETTINGS.visibility, "public");
    const [text, setText] = React.useState("");
    const [warning, setWarning] = React.useState("");
    const [alt, setAlt] = React.useState<Record<string, string>>({});
    const busy = s.sharer.store((st) => st.busy);
    const last = s.sharer.store((st) => st.last);

    const dest = destinationById(destId);
    const poster = posterFor(dest);
    const status = {
      bluesky: s.bluesky.store((a) => a.status),
      mastodon: s.mastodon.store((a) => a.status),
      pixelfed: s.pixelfed.store((a) => a.status),
    };
    const signedIn = dest.delivery.kind === "post" && status[dest.delivery.service] === "signed-in";
    const maxText = useLimit(poster, signedIn) ?? (dest.id === "bluesky" ? BLUESKY.maxText : null);
    const border = BORDERS[borderId] ?? BORDERS.white;
    const altOf = (p: CatalogPhoto) => alt[p.id] ?? p.exif?.imageDescription ?? "";
    const length = graphemeCount(text.trim());
    const over = maxText !== null && length > maxText;

    const run = (action: Action) =>
      void s.sharer.run(action, {
        photos,
        destination: dest,
        fit,
        border,
        alt: Object.fromEntries(photos.map((p) => [p.id, altOf(p)])),
        post: { text, visibility, warning: dest.id === "bluesky" ? undefined : warning },
      });

    const groups = [
      { title: "Post from Safelight", items: DESTINATIONS.filter((d) => d.delivery.kind === "post").map((d) => ({ value: d.id, label: d.label })) },
      { title: "Save, then upload on the site", items: DESTINATIONS.filter((d) => d.delivery.kind === "site").map((d) => ({ value: d.id, label: d.label })) },
    ];

    if (!photos.length)
      return (
        <div style={{ padding: 24 }}>
          <p style={note}>Select photos in the Library to share them.</p>
        </div>
      );

    return (
      <div style={{ display: "flex", height: "100%", minHeight: 0, color: tokens.textPrimary }}>
        <div style={{ width: 340, flex: "none", overflowY: "auto", padding: 12, borderRight: `1px solid ${tokens.borderSubtle}` }}>
          <Stack gap={10}>
            {photos.map((p) => (
              <Row key={p.id} gap={10} align="flex-start">
                <Preview photo={p} dest={dest} fit={fit} border={border} />
                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{api.catalog.photoDisplayName(p)}</span>
                  {poster ? (
                    <TextArea
                      aria-label={`Alt text for ${p.filename}`}
                      placeholder="Alt text"
                      title="Describes the photo for people who can't see it. Starts from the photo's caption."
                      rows={2}
                      value={altOf(p)}
                      onChange={(v) => setAlt((a) => ({ ...a, [p.id]: v }))}
                    />
                  ) : null}
                </Stack>
              </Row>
            ))}
          </Stack>
        </div>

        <div style={{ flex: 1, minWidth: 300, overflowY: "auto", padding: 12 }}>
          <Stack gap={12}>
            <Section title="Destination">
              <Stack gap={8}>
                <Select ariaLabel="Destination" value={dest.id} onChange={setDestId} groups={groups} />
                {restricted(dest) ? (
                  <Row gap={8} align="center" wrap>
                    <span title="What fills the frame when a photo's shape isn't one the destination shows">
                      <SegmentedControl
                        size="sm"
                        value={fit}
                        onChange={(v) => setFit(v === "crop" ? "crop" : "border")}
                        options={[
                          { value: "border", label: "Border" },
                          { value: "crop", label: "Crop" },
                        ]}
                      />
                    </span>
                    {fit === "border" ? (
                      <span title="Border colour">
                        <SegmentedControl
                          size="sm"
                          value={borderId}
                          onChange={(v) => setBorderId(v in BORDERS ? (v as BorderId) : "white")}
                          options={[
                            { value: "white", label: "White" },
                            { value: "grey", label: "Grey" },
                            { value: "black", label: "Black" },
                          ]}
                        />
                      </span>
                    ) : null}
                  </Row>
                ) : null}
              </Stack>
            </Section>

            {dest.delivery.kind === "post" ? (
              <>
                <Section title="Account">
                  {dest.delivery.service === "bluesky" ? (
                    <BlueskyAccount />
                  ) : (
                    <FediverseAccount
                      service={dest.delivery.service === "mastodon" ? s.mastodon : s.pixelfed}
                      example={dest.delivery.service === "mastodon" ? "mastodon.social" : "pixelfed.social"}
                    />
                  )}
                </Section>
                <Section title="Post" right={maxText !== null ? <span style={{ ...note, color: over ? tokens.labelRed : tokens.textMuted }}>{`${length} / ${maxText}`}</span> : null}>
                  <Stack gap={6}>
                    <TextArea aria-label="Post text" placeholder="Say something about it" rows={4} value={text} onChange={setText} />
                    {dest.id !== "bluesky" ? (
                      <>
                        <Select ariaLabel="Who can see it" title="Who can see the post" value={visibility} onChange={(v) => setVisibility(v as Visibility)} options={VISIBILITIES} />
                        <TextInput aria-label="Content warning" placeholder="Content warning (optional)" title="Hides the photos behind this text until someone opens them" value={warning} onChange={setWarning} />
                      </>
                    ) : null}
                  </Stack>
                </Section>
              </>
            ) : (
              <Section title="Folder">
                <FolderRow />
              </Section>
            )}

            <Stack gap={6}>
              {busy ? (
                <Row gap={8} align="center">
                  <div style={{ flex: 1 }}>
                    <ProgressBar indeterminate label="Sharing" />
                  </div>
                  <Button size="sm" onClick={s.sharer.cancel}>
                    Stop
                  </Button>
                </Row>
              ) : (
                <Row gap={6} wrap>
                  {poster ? (
                    <Button variant="primary" disabled={!signedIn || over} onClick={() => run("post")} title={signedIn ? undefined : `Sign in to ${dest.service} first`}>
                      {photos.length > 1 ? `Post ${photos.length} photos` : "Post"}
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => run("save-open")} title={`Saves the photos, shows them in your file manager and opens ${dest.service}`}>
                      Save and open {dest.service}
                    </Button>
                  )}
                  {poster ? null : (
                    <Button onClick={() => run("save")} title="Saves the photos without opening the site">
                      Save
                    </Button>
                  )}
                  <Button onClick={() => run("copy")} disabled={photos.length !== 1} title={photos.length === 1 ? "Copies the photo, sized for this destination, to paste into a post" : "Copy takes one photo at a time"}>
                    Copy
                  </Button>
                </Row>
              )}
              {last && !busy ? (
                <Row gap={6} align="center" wrap>
                  <p style={{ ...note, color: last.ok ? tokens.textSecondary : tokens.labelRed }}>{last.message}</p>
                  {last.url ? (
                    <Button size="sm" variant="ghost" onClick={() => window.open(last.url ?? "", "_blank")}>
                      Open post
                    </Button>
                  ) : null}
                </Row>
              ) : null}
              {last?.failed.length ? (
                <ul style={{ ...muted, paddingLeft: 14, margin: 0 }}>
                  {last.failed.map((f, i) => (
                    <li key={`${f.name}-${i}`}>
                      {f.name}: {f.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Stack>
          </Stack>
        </div>
      </div>
    );
  };
}
