// Social Export — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// Mastodon and Pixelfed, which share Mastodon's API. Signing in registers
// Safelight with the instance (once per instance), then runs OAuth in the
// browser: PKCE, a state, and the loopback redirect, whose port both
// servers ignore (RFC 8252 §7.3). The access token doesn't expire; a 401
// signs the person out.

import { MASTODON_DEFAULTS, type PostLimits, SETTINGS } from "./config";
import { type Fetch, ServiceError, originOf, send, sendJson } from "./http";
import { multipart } from "./multipart";
import type { Poster, PostImage, PostOptions } from "./poster";
import type { SafelightAPI } from "./safelight";
import { type AccountState, SIGNED_OUT, type Vault } from "./vault";

export type FediverseKind = "mastodon" | "pixelfed";

const PROFILE: Record<FediverseKind, { name: string; scopes: string; settings: string; maxBytes: number; maxPixels?: number }> = {
  mastodon: { name: "Mastodon", scopes: "read:accounts write:media write:statuses", settings: SETTINGS.mastodon, maxBytes: 16 * 1024 * 1024, maxPixels: 8_294_400 },
  pixelfed: { name: "Pixelfed", scopes: "read write", settings: SETTINGS.pixelfed, maxBytes: 15 * 1024 * 1024 },
};

/** The redirect registered with the instance; the browser comes back on the
 *  same address with the port Safelight listens on. */
export const LOOPBACK = "http://127.0.0.1";
const CLIENT_NAME = "Safelight";
const WEBSITE = "https://github.com/anthonyreimche/SafeLight";
const MEDIA_WAIT_MS = 30_000;
const MEDIA_POLL_MS = 1_000;

interface Client {
  origin: string;
  clientId: string;
  clientSecret: string;
}

interface Account {
  origin: string;
  acct: string;
}

export interface Sleep {
  (ms: number, signal?: AbortSignal): Promise<void>;
}

const realSleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new ServiceError("cancelled", "Stopped."));
      },
      { once: true },
    );
  });

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const randomToken = (n = 32) => base64url(crypto.getRandomValues(new Uint8Array(n)));

export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(64);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

function savedAccount(settings: SafelightAPI["settings"], key: string): Account | null {
  const v = settings.get<unknown>(key, null);
  if (typeof v !== "object" || v === null) return null;
  const { origin, acct } = v as { origin?: unknown; acct?: unknown };
  return typeof origin === "string" && typeof acct === "string" ? { origin, acct } : null;
}

/** A number at `path` in `body`, if it is a positive one. */
function numberAt(body: unknown, ...path: string[]): number | undefined {
  let v: unknown = body;
  for (const key of path) v = typeof v === "object" && v !== null ? (v as Record<string, unknown>)[key] : undefined;
  return typeof v === "number" && v > 0 ? v : undefined;
}

export function createFediverse(
  api: SafelightAPI,
  vault: Vault,
  kind: FediverseKind,
  sleep: Sleep = realSleep,
): Poster & { signIn(instance: string): Promise<void>; cancelSignIn(): void } {
  const profile = PROFILE[kind];
  const SERVICE = profile.name;
  const SIGN_IN_AGAIN = `Your ${SERVICE} sign-in has expired or was removed. Sign in again.`;
  const fetch: Fetch = api.network.fetch;
  const store = api.stores.create<AccountState>()(() => SIGNED_OUT);
  const clientKey = `${kind}.client`;
  const tokenKey = `${kind}.token`;
  let account: Account | null = null;
  let signingIn: AbortController | null = null;
  let limits: PostLimits | null = null;

  async function signedOut(message: string | null): Promise<void> {
    account = null;
    limits = null;
    api.settings.set(profile.settings, null);
    await vault.delete(tokenKey);
    store.setState({ ...SIGNED_OUT, message });
  }

  /** The client this instance knows Safelight by, registering one if none is kept. */
  async function client(origin: string, fresh: boolean): Promise<Client> {
    const kept = await vault.get(clientKey);
    if (kept && !fresh) {
      try {
        const c = JSON.parse(kept) as Client;
        if (c.origin === origin && c.clientId) return c;
      } catch {
        // Unreadable: register again.
      }
    }
    const app = await sendJson<{ client_id: string; client_secret: string }>(fetch, SERVICE, `${origin}/api/v1/apps`, {
      form: { client_name: CLIENT_NAME, redirect_uris: LOOPBACK, scopes: profile.scopes, website: WEBSITE },
    });
    const made = { origin, clientId: app.client_id, clientSecret: app.client_secret };
    await vault.set(clientKey, JSON.stringify(made));
    return made;
  }

  async function authorize(c: Client, signal: AbortSignal): Promise<string> {
    const { verifier, challenge } = await pkce();
    const state = randomToken();
    let redirectUri = "";
    const answer = await api.network.authorizeInBrowser(
      (redirect) => {
        redirectUri = redirect;
        const query = new URLSearchParams({
          client_id: c.clientId,
          redirect_uri: redirect,
          response_type: "code",
          scope: profile.scopes,
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
        });
        return `${c.origin}/oauth/authorize?${query}`;
      },
      { signal, timeoutMs: 10 * 60_000 },
    );
    if (answer.get("error")) throw new ServiceError("refused", answer.get("error_description") || `${SERVICE} didn't allow Safelight in.`, undefined, answer.get("error") ?? undefined);
    const code = answer.get("code");
    if (answer.get("state") !== state || !code) throw new ServiceError("refused", `${SERVICE} answered the sign-in with something Safelight didn't ask for.`);
    const token = await sendJson<{ access_token?: string }>(fetch, SERVICE, `${c.origin}/oauth/token`, {
      form: {
        grant_type: "authorization_code",
        code,
        client_id: c.clientId,
        client_secret: c.clientSecret,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        scope: profile.scopes,
      },
    });
    if (!token.access_token) throw new ServiceError("refused", `${SERVICE} answered without an access token.`);
    return token.access_token;
  }

  async function signIn(instance: string): Promise<void> {
    const origin = originOf(instance);
    if (!origin) {
      store.setState({ ...SIGNED_OUT, message: `Type your ${SERVICE} server's address, such as ${kind === "mastodon" ? "mastodon.social" : "pixelfed.social"}.` });
      return;
    }
    signingIn?.abort();
    const controller = new AbortController();
    signingIn = controller;
    store.setState({ status: "signing-in", message: null });
    try {
      if (!(await api.network.requestAccess(origin))) throw new ServiceError("refused", `Safelight wasn't allowed to reach ${origin}.`);
      let token: string;
      try {
        token = await authorize(await client(origin, false), controller.signal);
      } catch (error) {
        // A kept client the instance no longer knows: register again, once.
        if (!(error instanceof ServiceError && (error.code === "invalid_client" || error.status === 401))) throw error;
        token = await authorize(await client(origin, true), controller.signal);
      }
      const me = await sendJson<{ acct?: string; username?: string }>(fetch, SERVICE, `${origin}/api/v1/accounts/verify_credentials`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      account = { origin, acct: `@${me.acct || me.username || ""}@${new URL(origin).host}` };
      api.settings.set(profile.settings, account);
      const remembered = await vault.set(tokenKey, token);
      store.setState({ status: "signed-in", name: account.acct, message: null, remembered });
    } catch (error) {
      const stopped = controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      store.setState({
        ...SIGNED_OUT,
        message: stopped ? null : timedOut ? "The sign-in took too long. Try again." : error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (signingIn === controller) signingIn = null;
    }
  }

  async function restore(): Promise<void> {
    const saved = savedAccount(api.settings, profile.settings);
    if (!saved || !(await vault.get(tokenKey))) return;
    account = saved;
    store.setState({ status: "signed-in", name: saved.acct, message: null, remembered: true });
  }

  async function authorized<T>(path: string, init: Parameters<typeof send>[3] = {}): Promise<T> {
    const token = await vault.get(tokenKey);
    if (!account || !token) throw new ServiceError("signed-out", `Sign in to ${SERVICE} first.`);
    try {
      return await sendJson<T>(fetch, SERVICE, `${account.origin}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
    } catch (error) {
      if (error instanceof ServiceError && error.status === 401) {
        await signedOut(SIGN_IN_AGAIN);
        throw new ServiceError("expired", SIGN_IN_AGAIN, 401);
      }
      throw error;
    }
  }

  async function readLimits(): Promise<PostLimits> {
    if (limits) return limits;
    const fallback: PostLimits = { maxPhotos: MASTODON_DEFAULTS.maxPhotos, maxText: MASTODON_DEFAULTS.maxText, maxBytes: profile.maxBytes, maxPixels: profile.maxPixels };
    if (!account) return fallback;
    for (const path of ["/api/v2/instance", "/api/v1/instance"]) {
      try {
        const body = await sendJson<unknown>(fetch, SERVICE, `${account.origin}${path}`);
        const c = ["configuration"];
        limits = {
          maxPhotos: numberAt(body, ...c, "statuses", "max_media_attachments") ?? fallback.maxPhotos,
          maxText: numberAt(body, ...c, "statuses", "max_characters") ?? numberAt(body, "max_toot_chars") ?? fallback.maxText,
          maxBytes: numberAt(body, ...c, "media_attachments", "image_size_limit") ?? fallback.maxBytes,
          maxPixels: numberAt(body, ...c, "media_attachments", "image_matrix_limit") ?? fallback.maxPixels,
        };
        return limits;
      } catch {
        // Try the older address, then the defaults.
      }
    }
    return fallback;
  }

  async function upload(image: PostImage, name: string, signal?: AbortSignal): Promise<string> {
    const { body, contentType } = multipart([
      { name: "file", filename: name, type: image.blob.type || "image/jpeg", data: new Uint8Array(await image.blob.arrayBuffer()) },
      ...(image.alt.trim() ? [{ name: "description", value: image.alt.trim() }] : []),
    ]);
    const init = { method: "POST" as const, headers: { "Content-Type": contentType }, body, signal, timeoutMs: 120_000 };
    let media: { id: string; url?: string | null };
    try {
      media = await authorized("/api/v2/media", init);
    } catch (error) {
      if (!(error instanceof ServiceError && error.status === 404)) throw error;
      media = await authorized("/api/v1/media", init);
    }
    for (let waited = 0; !media.url; waited += MEDIA_POLL_MS) {
      if (waited >= MEDIA_WAIT_MS) throw new ServiceError("busy", `${SERVICE} is still processing a photo. Try again in a minute.`);
      await sleep(MEDIA_POLL_MS, signal);
      // 206 while the server is still processing it: no url yet.
      media = await authorized(`/api/v1/media/${encodeURIComponent(media.id)}`, { signal });
    }
    return media.id;
  }

  async function post(images: PostImage[], options: PostOptions): Promise<{ url: string | null }> {
    const max = (await readLimits()).maxPhotos;
    if (images.length > max) throw new ServiceError("refused", `A post on this ${SERVICE} server takes ${max} photos at most.`);
    const ids: string[] = [];
    for (const [i, image] of images.entries()) {
      if (options.signal?.aborted) throw new ServiceError("cancelled", "Stopped.");
      ids.push(await upload(image, `photo-${i + 1}.jpg`, options.signal));
    }
    const warning = options.warning?.trim() ?? "";
    const status = await authorized<{ url?: string | null; uri?: string }>("/api/v1/statuses", {
      headers: { "Idempotency-Key": randomToken(16) },
      json: {
        status: options.text.trim(),
        media_ids: ids,
        visibility: options.visibility ?? "public",
        sensitive: Boolean(options.sensitive || warning),
        ...(warning ? { spoiler_text: warning } : {}),
      },
    });
    return { url: status.url ?? status.uri ?? null };
  }

  return {
    id: kind,
    store,
    signIn,
    cancelSignIn: () => signingIn?.abort(),
    restore,
    signOut: () => signedOut(null),
    limits: readLimits,
    post,
  };
}
