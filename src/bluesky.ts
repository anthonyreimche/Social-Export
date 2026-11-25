// Social Export — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// Bluesky over the AT Protocol's XRPC calls. Sign-in takes an app password at
// the person's hosting provider; later calls go to their PDS, which the
// session's DID document names. The refresh token is kept in the vault, and
// the access token only in memory: an expired one is refreshed once, and a
// refused refresh signs the person out.

import { BLUESKY, type PostLimits, SETTINGS } from "./config";
import { type Fetch, ServiceError, originOf, send, sendJson } from "./http";
import type { Poster, PostImage, PostOptions } from "./poster";
import { blueskyFacets } from "./richtext";
import type { SafelightAPI } from "./safelight";
import { type AccountState, SIGNED_OUT, type Vault } from "./vault";

const SERVICE = "Bluesky";
const REFRESH_KEY = "bluesky.refresh";
export const SIGN_IN_AGAIN = "Your Bluesky sign-in has expired or was removed. Sign in again.";
const WRONG_PASSWORD = "Bluesky didn't accept that handle and app password.";
const NEEDS_APP_PASSWORD =
  "Your account asks for a code from email with its main password. Use an app password instead (Bluesky ▸ Settings ▸ Privacy and security ▸ App passwords).";

interface Account {
  handle: string;
  did: string;
  pds: string;
}

interface Session {
  accessJwt: string;
  refreshJwt: string;
  handle: string;
  did: string;
  didDoc?: unknown;
}

interface BlobRef {
  $type: "blob";
  ref: { $link: string };
  mimeType: string;
  size: number;
}

/** The PDS a DID document names, or null. */
export function pdsOf(didDoc: unknown): string | null {
  if (typeof didDoc !== "object" || didDoc === null || !("service" in didDoc) || !Array.isArray(didDoc.service)) return null;
  for (const s of didDoc.service as unknown[]) {
    if (typeof s !== "object" || s === null) continue;
    const { id, serviceEndpoint } = s as { id?: unknown; serviceEndpoint?: unknown };
    if (typeof id === "string" && id.endsWith("#atproto_pds") && typeof serviceEndpoint === "string") {
      try {
        const url = new URL(serviceEndpoint);
        if (url.protocol === "https:") return url.origin;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function savedAccount(settings: SafelightAPI["settings"]): Account | null {
  const v = settings.get<unknown>(SETTINGS.bluesky, null);
  if (typeof v !== "object" || v === null) return null;
  const { handle, did, pds } = v as Partial<Record<keyof Account, unknown>>;
  return typeof handle === "string" && typeof did === "string" && typeof pds === "string" ? { handle, did, pds } : null;
}

const rkeyOf = (uri: string) => uri.split("/").pop() ?? "";

export function createBluesky(api: SafelightAPI, vault: Vault): Poster & {
  signIn(identifier: string, password: string, provider?: string): Promise<void>;
} {
  const fetch: Fetch = api.network.fetch;
  const store = api.stores.create<AccountState>()(() => SIGNED_OUT);
  let account: Account | null = null;
  let accessJwt: string | null = null;
  let refreshing: Promise<string> | null = null;

  const xrpc = (origin: string, nsid: string) => `${origin}/xrpc/${nsid}`;

  async function signedOut(message: string | null): Promise<void> {
    account = null;
    accessJwt = null;
    api.settings.set(SETTINGS.bluesky, null);
    await vault.delete(REFRESH_KEY);
    store.setState({ ...SIGNED_OUT, message });
  }

  async function keep(session: Session, pds: string): Promise<void> {
    account = { handle: session.handle, did: session.did, pds };
    accessJwt = session.accessJwt;
    api.settings.set(SETTINGS.bluesky, account);
    const remembered = await vault.set(REFRESH_KEY, session.refreshJwt);
    store.setState({ status: "signed-in", name: `@${session.handle}`, message: null, remembered });
  }

  async function signIn(identifier: string, password: string, typedProvider: string = BLUESKY.defaultProvider): Promise<void> {
    const provider = originOf(typedProvider || BLUESKY.defaultProvider);
    if (!provider) {
      store.setState({ ...SIGNED_OUT, message: "Type your hosting provider's https address, such as bsky.social." });
      return;
    }
    store.setState({ status: "signing-in", message: null });
    try {
      if (!(await api.network.requestAccess(provider))) throw new ServiceError("refused", `Safelight wasn't allowed to reach ${provider}.`);
      let session: Session;
      try {
        session = await sendJson<Session>(fetch, SERVICE, xrpc(provider, "com.atproto.server.createSession"), {
          json: { identifier: identifier.trim().replace(/^@/, ""), password: password.trim() },
        });
      } catch (error) {
        if (error instanceof ServiceError && error.code === "AuthFactorTokenRequired") throw new ServiceError("refused", NEEDS_APP_PASSWORD);
        if (error instanceof ServiceError && error.status === 401) throw new ServiceError("refused", WRONG_PASSWORD);
        throw error;
      }
      const pds = pdsOf(session.didDoc) ?? provider;
      if (!(await api.network.requestAccess(pds))) throw new ServiceError("refused", `Safelight wasn't allowed to reach your Bluesky server, ${pds}.`);
      await keep(session, pds);
    } catch (error) {
      store.setState({ ...SIGNED_OUT, message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function restore(): Promise<void> {
    const saved = savedAccount(api.settings);
    if (!saved || !(await vault.get(REFRESH_KEY))) return;
    account = saved;
    store.setState({ status: "signed-in", name: `@${saved.handle}`, message: null, remembered: true });
  }

  /** A fresh access token from the kept refresh token. */
  function refresh(): Promise<string> {
    refreshing ??= (async () => {
      const token = await vault.get(REFRESH_KEY);
      if (!account || !token) throw new ServiceError("signed-out", SIGN_IN_AGAIN);
      try {
        const session = await sendJson<Session>(fetch, SERVICE, xrpc(account.pds, "com.atproto.server.refreshSession"), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        await keep(session, account.pds);
        return session.accessJwt;
      } catch (error) {
        if (error instanceof ServiceError && (error.status === 400 || error.status === 401)) {
          await signedOut(SIGN_IN_AGAIN);
          throw new ServiceError("expired", SIGN_IN_AGAIN, error.status, error.code);
        }
        throw error;
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  /** An authorized call to the PDS, refreshing an expired token once. */
  async function call<T>(nsid: string, init: Parameters<typeof send>[3]): Promise<T> {
    if (!account) throw new ServiceError("signed-out", "Sign in to Bluesky first.");
    let token = accessJwt ?? (await refresh());
    for (let attempt = 0; ; attempt++) {
      try {
        return await sendJson<T>(fetch, SERVICE, xrpc(account.pds, nsid), {
          ...init,
          headers: { ...init?.headers, Authorization: `Bearer ${token}` },
        });
      } catch (error) {
        const expired = error instanceof ServiceError && (error.code === "ExpiredToken" || error.code === "InvalidToken" || error.status === 401);
        if (!expired || attempt > 0) throw error;
        token = await refresh();
      }
    }
  }

  async function post(images: PostImage[], options: PostOptions): Promise<{ url: string | null }> {
    if (images.length > BLUESKY.maxPhotos) throw new ServiceError("refused", `A Bluesky post takes ${BLUESKY.maxPhotos} photos at most.`);
    const embedded = [];
    for (const image of images) {
      if (options.signal?.aborted) throw new ServiceError("cancelled", "Stopped.");
      const { blob } = await call<{ blob: BlobRef }>("com.atproto.repo.uploadBlob", {
        method: "POST",
        headers: { "Content-Type": image.blob.type || "image/jpeg" },
        body: new Uint8Array(await image.blob.arrayBuffer()),
        signal: options.signal,
        timeoutMs: 120_000,
      });
      embedded.push({ image: blob, alt: image.alt, aspectRatio: { width: image.width, height: image.height } });
    }
    const text = options.text.trim();
    const facets = blueskyFacets(text);
    const created = await call<{ uri: string }>("com.atproto.repo.createRecord", {
      json: {
        repo: account?.did,
        collection: "app.bsky.feed.post",
        record: {
          $type: "app.bsky.feed.post",
          text,
          ...(facets.length ? { facets } : {}),
          createdAt: new Date().toISOString(),
          embed: { $type: "app.bsky.embed.images", images: embedded },
        },
      },
    });
    const handle = account?.handle ?? "";
    return { url: `https://bsky.app/profile/${handle}/post/${rkeyOf(created.uri)}` };
  }

  return {
    id: "bluesky",
    store,
    signIn,
    restore,
    signOut: () => signedOut(null),
    limits: async (): Promise<PostLimits> => ({ maxPhotos: BLUESKY.maxPhotos, maxText: BLUESKY.maxText, maxBytes: 2_000_000 }),
    post,
  };
}
