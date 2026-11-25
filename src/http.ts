// Social Export — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// Requests to the services. They go through api.network.fetch, which
// Safelight makes from outside the page, so a service that sends no CORS
// headers still answers. A refusal becomes a ServiceError worded for the
// person, carrying the service's own error code where it gave one.

import type { NetworkRequestInit, SafelightAPI } from "./safelight";

export type Fetch = SafelightAPI["network"]["fetch"];

export type ServiceErrorKind = "signed-out" | "expired" | "refused" | "busy" | "network" | "cancelled";

export class ServiceError extends Error {
  constructor(
    readonly kind: ServiceErrorKind,
    message: string,
    readonly status?: number,
    /** The service's error code: Bluesky's "ExpiredToken", OAuth's "invalid_grant". */
    readonly code?: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface RequestInit {
  method?: NonNullable<NetworkRequestInit["method"]>;
  headers?: Record<string, string>;
  /** Sent as JSON, with its Content-Type. */
  json?: unknown;
  /** Sent as an HTML form (application/x-www-form-urlencoded). */
  form?: Record<string, string>;
  body?: string | Uint8Array;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** The service's error code and words from a refusal's body. */
async function refusal(res: Response): Promise<{ code?: string; message: string }> {
  const text = await res.text().catch(() => "");
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === "object" && body !== null) {
      const get = (key: string) => (key in body ? (body as Record<string, unknown>)[key] : undefined);
      const code = get("error");
      const words = [get("message"), get("error_description"), code].find((v) => typeof v === "string" && v.trim());
      return { code: typeof code === "string" ? code : undefined, message: String(words ?? `${res.status} ${res.statusText}`) };
    }
  } catch {
    if (text.trim() && text.length < 300 && !/^\s*</.test(text)) return { message: text.trim() };
  }
  return { message: `${res.status} ${res.statusText}`.trim() };
}

/** Send a request; resolves with a successful Response. `service` names the
 *  service in messages. */
export async function send(fetch: Fetch, service: string, url: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json", ...init.headers };
  let body = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (init.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(init.form).toString();
  }
  let res: Response;
  try {
    res = await fetch(url, { method: init.method ?? (body === undefined ? "GET" : "POST"), headers, body, signal: init.signal, timeoutMs: init.timeoutMs });
  } catch (error) {
    if (init.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw new ServiceError("cancelled", "Stopped.");
    if (error instanceof DOMException && error.name === "TimeoutError") throw new ServiceError("network", `${service} took too long to answer. Try again.`);
    throw new ServiceError("network", `Couldn't reach ${service}. Check your connection and try again.`);
  }
  if (res.ok) return res;
  const { code, message } = await refusal(res);
  if (res.status === 429) throw new ServiceError("busy", `${service} asks to wait before trying again.`, 429, code);
  if (res.status >= 500) throw new ServiceError("busy", `${service} had a problem: ${message}`, res.status, code);
  throw new ServiceError("refused", message, res.status, code);
}

export async function sendJson<T>(fetch: Fetch, service: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await send(fetch, service, url, init);
  return (await res.json()) as T;
}

/** The https origin of an address the person typed ("mastodon.social",
 *  "@me@mastodon.social", "https://pixelfed.social/"), or null. */
export function originOf(typed: string): string | null {
  let text = typed.trim();
  const handle = /^@?[^@\s/]+@([^@\s/]+)$/.exec(text);
  if (handle) text = handle[1];
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    return url.protocol === "https:" && url.hostname.includes(".") ? url.origin : null;
  } catch {
    return null;
  }
}

export const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
