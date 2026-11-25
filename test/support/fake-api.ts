// A stand-in Safelight API for unit tests, over real React and zustand. It has
// only what this extension uses: reading any other member throws, naming it,
// so a test shows what to add here when the extension starts using more.
//
// Requests go to `server`, a function the test writes, and are recorded.
// Settings are a Map that tells listeners of each write; secrets a Map while
// `keychain` is true. Signing in through the browser asks `browser` what the
// browser comes back with. The UI kit's controls are plain elements that keep
// their props' behaviour.

import * as React from "react";
import { create } from "zustand";
import type {
  AuthorizeOptions,
  ButtonProps,
  CatalogPhoto,
  ExportSettings,
  FieldProps,
  GridMenuItemContribution,

  NetworkRequestInit,
  RenderedPhoto,
  RowProps,
  SafelightAPI,
  SectionProps,
  SegmentedControlProps,
  SelectProps,
  StackProps,
  TextAreaProps,
  TextInputProps,
  ToggleProps,
  TopBarButtonContribution,
  UITokens,
  WindowContribution,
} from "../../src/safelight";
import { EXTENSION_ID } from "../../src/config";
import type { NoticeOptions } from "../../src/share";

export interface Sent {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | Uint8Array | undefined;
  /** The body as text, parsed as JSON or a form where it is one. */
  json: unknown;
  form: URLSearchParams | null;
}

export type Server = (req: Sent) => { status?: number; json?: unknown; text?: string } | undefined;

type CatalogSlice = { photos: CatalogPhoto[]; selectedIds: Set<string> };

const TOKENS = new Proxy({} as UITokens, { get: (_t, key) => `var(--${String(key)})` });

export interface RigOptions {
  server?: Server;
  keychain?: boolean;
  /** What the browser comes back with, given the sign-in page's address. */
  browser?: (url: URL) => Record<string, string>;
  /** Addresses the person refuses. */
  refuse?: string[];
  photos?: CatalogPhoto[];
  /** The selected photos. */
  target?: string[];
  /** The photo open in Develop. */
  active?: string;
  /** The name of the folder the person picks; none picks nothing. */
  pickFolder?: string;
}

/** A folder in memory, as far as the extension uses one. Like core's desktop
 *  handle, getFileHandle answers for a name that isn't there. */
export class MemoryFolder {
  readonly kind = "directory";
  readonly files = new Map<string, Blob>();
  constructor(readonly name: string) {}
  async *keys() {
    yield* this.files.keys();
  }
  async getFileHandle(name: string) {
    return {
      createWritable: async () => {
        let data: Blob = new Blob([]);
        return {
          write: async (blob: Blob) => {
            data = blob;
          },
          close: async () => void this.files.set(name, data),
        };
      },
    };
  }
}

const folders = new Map<string, MemoryFolder>();
export const memoryFolder = (name: string) => {
  let f = folders.get(name);
  if (!f) folders.set(name, (f = new MemoryFolder(name)));
  return f as MemoryFolder & FileSystemDirectoryHandle;
};
export const resetFolders = () => folders.clear();

export function fakeApi(options: RigOptions = {}) {
  const sent: Sent[] = [];
  const settings = new Map<string, unknown>();
  const settingsListeners = new Set<() => void>();
  const secrets = new Map<string, string>();
  const asked: string[] = [];
  const opened: string[] = [];
  const notices: NoticeOptions[] = [];
  const revealed: string[] = [];
  const windows: WindowContribution[] = [];
  const menu: GridMenuItemContribution[] = [];
  const topBar: TopBarButtonContribution[] = [];
  const openWindows = create<{ open: string[] }>()(() => ({ open: [] }));
  const renders: { ids: string[]; settings: Partial<ExportSettings> }[] = [];
  let browserUrl: URL | null = null;
  const catalog = create<CatalogSlice>()(() => ({ photos: options.photos ?? [], selectedIds: new Set(options.target ?? []) }));
  const active = options.active;
  const picks: (string | null)[] = [];
  const kept = new Map<string, MemoryFolder>();

  async function fetch(url: string, init: NetworkRequestInit = {}): Promise<Response> {
    if (init.signal?.aborted) throw new DOMException("Stopped.", "AbortError");
    const body = init.body;
    const text = typeof body === "string" ? body : body ? new TextDecoder().decode(body) : "";
    const headers = init.headers ?? {};
    const type = Object.entries(headers).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";
    let json: unknown = undefined;
    if (type.includes("json")) json = JSON.parse(text);
    const req: Sent = { method: init.method ?? "GET", url, headers, body, json, form: type.includes("urlencoded") ? new URLSearchParams(text) : null };
    sent.push(req);
    const answer = options.server?.(req);
    if (!answer) return new Response(JSON.stringify({ error: "NotFound" }), { status: 404 });
    const status = answer.status ?? 200;
    const payload = answer.text ?? (answer.json === undefined ? "" : JSON.stringify(answer.json));
    return new Response(status === 204 ? null : payload, { status, headers: { "content-type": "application/json" } });
  }

  async function authorizeInBrowser(build: (redirect: string) => string, opts?: AuthorizeOptions): Promise<URLSearchParams> {
    if (opts?.signal?.aborted) throw new DOMException("Stopped.", "AbortError");
    browserUrl = new URL(build("http://127.0.0.1:53682"));
    const back = options.browser?.(browserUrl) ?? { code: "the-code", state: browserUrl.searchParams.get("state") ?? "" };
    return new URLSearchParams(back);
  }

  const kit = {
    Button: ({ children, variant: _v, size: _s, active: _a, full: _f, ...rest }: ButtonProps) => React.createElement("button", { type: "button", ...rest }, children),
    TextInput: ({ value, onChange, ...rest }: TextInputProps) =>
      React.createElement("input", { ...rest, value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) }),
    TextArea: ({ value, onChange, mono: _m, ...rest }: TextAreaProps) =>
      React.createElement("textarea", { ...rest, value, onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value) }),
    Select: ({ value, onChange, options: flat, groups, ariaLabel, title }: SelectProps) =>
      React.createElement(
        "select",
        { value, "aria-label": ariaLabel, title, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value) },
        [...(flat ?? []), ...(groups ?? []).flatMap((g) => g.items)].map((o) => React.createElement("option", { key: o.value, value: o.value }, o.label)),
      ),
    SegmentedControl: ({ value, onChange, options: opts }: SegmentedControlProps) =>
      React.createElement(
        "div",
        { role: "radiogroup" },
        opts.map((o) =>
          React.createElement("button", { key: o.value, type: "button", role: "radio", "aria-checked": o.value === value, onClick: () => onChange(o.value) }, o.label),
        ),
      ),
    Toggle: ({ checked, onChange, label, ariaLabel }: ToggleProps) =>
      React.createElement("label", null, label, React.createElement("input", { type: "checkbox", "aria-label": ariaLabel, checked, onChange: () => onChange(!checked) })),
    Field: ({ label, children }: FieldProps) => React.createElement("label", null, label, children),
    Section: ({ title, right, children }: SectionProps) => React.createElement("section", null, React.createElement("h3", null, title), right, children),
    Stack: ({ children, style }: StackProps) => React.createElement("div", { style }, children),
    Row: ({ children, style }: RowProps) => React.createElement("div", { style }, children),
    ProgressBar: () => React.createElement("progress"),
    tokens: TOKENS,
  };

  const members = {
    version: 1,
    extensionId: EXTENSION_ID,
    react: React,
    registerWindow: (c: WindowContribution) => void windows.push(c),
    registerGridMenuItem: (c: GridMenuItemContribution) => void menu.push(c),
    registerTopBarButton: (c: TopBarButtonContribution) => void topBar.push(c),
    windows: {
      open: (id: string) => openWindows.setState((s) => ({ open: [...new Set([...s.open, id])] })),
      close: (id: string) => openWindows.setState((s) => ({ open: s.open.filter((x) => x !== id) })),
      isOpen: (id: string) => openWindows.getState().open.includes(id),
      useOpen: (id: string) => openWindows((s) => s.open.includes(id)),
    },
    settings: {
      get: <T,>(key: string, fallback: T): T => (settings.has(key) ? (settings.get(key) as T) : fallback),
      set: (key: string, value: unknown) => {
        settings.set(key, value);
        for (const l of settingsListeners) l();
      },
      onChange: (l: () => void) => {
        settingsListeners.add(l);
        return () => void settingsListeners.delete(l);
      },
    },
    secrets: {
      available: async () => options.keychain !== false,
      get: async (key: string) => (options.keychain === false ? null : (secrets.get(key) ?? null)),
      set: async (key: string, value: string) => {
        if (options.keychain === false) throw new DOMException("No keychain.", "NotSupportedError");
        secrets.set(key, value);
      },
      delete: async (key: string) => void secrets.delete(key),
    },
    network: {
      fetch,
      authorizeInBrowser,
      requestAccess: async (url: string) => {
        asked.push(new URL(url).origin);
        return !(options.refuse ?? []).includes(new URL(url).origin);
      },
    },
    stores: { create, useCatalogStore: catalog },
    catalog: {
      useActivePhoto: () => catalog((c) => c.photos.find((p) => p.id === active)),
      photoDisplayName: (p: CatalogPhoto) => p.filename,
      requestThumbnail: () => {},
    },
    export: {
      renderPhotos: async (photos: CatalogPhoto[], s: Partial<ExportSettings> = {}): Promise<RenderedPhoto[]> => {
        renders.push({ ids: photos.map((p) => p.id), settings: s });
        return photos.map((photo) => ({ photo, blob: new Blob(["png"], { type: "image/png" }), width: s.longEdge ?? 100, height: Math.round((s.longEdge ?? 100) * 0.75) }));
      },
    },
    project: {
      reveal: async (path: string) => {
        revealed.push(path);
        return true;
      },
      pickKeptDirectory: async (_id: string, replacing?: string | null) => {
        picks.push(replacing ?? null);
        if (!options.pickFolder) return null;
        const folder = memoryFolder(options.pickFolder);
        const token = `token-${picks.length}`;
        kept.set(token, folder);
        return { token, folder };
      },
      openKeptDirectory: async (token: string) => {
        const folder = kept.get(token);
        return folder ? { folder } : { problem: "gone" as const };
      },
      forgetKeptDirectory: async (token: string) => void kept.delete(token),
      pathOf: (handle: unknown) => (handle instanceof MemoryFolder ? `C:\\Shared\\${handle.name}` : null),
    },
    ui: {
      ...kit,
      notify: (n: string | NoticeOptions) => {
        const notice = typeof n === "string" ? { message: n } : { ...n };
        notices.push(notice);
        return { update: (next: Partial<NoticeOptions>) => Object.assign(notice, next), close: () => {} };
      },
      alertDialog: async () => {},
    },
  };

  const originalOpen = window.open;
  window.open = ((url?: string | URL) => {
    opened.push(String(url));
    return null;
  }) as typeof window.open;

  return {
    api: strict(members, "api") as unknown as SafelightAPI,
    members,
    sent,
    settings,
    secrets,
    asked,
    opened,
    notices,
    revealed,
    windows,
    menu,
    topBar,
    renders,
    catalog,
    picks,
    browserUrl: () => browserUrl,
    restore: () => {
      window.open = originalOpen;
    },
  };
}

export type Rig = ReturnType<typeof fakeApi>;

/** Wraps a plain object so reading a member it lacks throws, naming the member. */
function strict<T extends object>(target: T, path: string): T {
  return new Proxy(target, {
    get(obj, key, receiver) {
      if (typeof key === "symbol" || key === "then" || key === "toJSON" || key === "$$typeof") return Reflect.get(obj, key, receiver);
      if (!(key in obj)) throw new Error(`The fake API has no ${path}.${key}. Add it to test/support/fake-api.ts.`);
      const value: unknown = Reflect.get(obj, key, receiver);
      const isPlainObject = typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
      return isPlainObject && key !== "react" && key !== "tokens" ? strict(value, `${path}.${key}`) : value;
    },
  });
}
