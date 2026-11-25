import { afterEach, describe, expect, it } from "vitest";
import { SETTINGS } from "../src/config";
import { originOf } from "../src/http";
import { createFediverse, type FediverseKind } from "../src/mastodon";
import { createVault } from "../src/vault";
import { fakeApi, type Rig, type RigOptions, type Sent } from "./support/fake-api";

const ORIGIN = "https://mastodon.example";

function mastodon(opts: { processing?: number; noV2Media?: boolean; instance?: unknown; tokenStatus?: number } = {}) {
  let left = opts.processing ?? 0;
  let media = 0;
  const server = (req: Sent) => {
    const { pathname } = new URL(req.url);
    if (pathname === "/api/v1/apps") return { json: { client_id: "cid", client_secret: "csecret" } };
    if (pathname === "/oauth/token") return { json: { access_token: "tok", token_type: "Bearer" } };
    if (pathname === "/api/v1/accounts/verify_credentials") return { json: { acct: "me", username: "me" } };
    if (opts.tokenStatus && req.headers.Authorization) return { status: opts.tokenStatus, json: { error: "The access token is invalid" } };
    if (pathname === "/api/v2/instance") return opts.instance ? { json: opts.instance } : undefined;
    if (pathname === "/api/v2/media" && !opts.noV2Media) return left > 0 ? { status: 202, json: { id: `m${++media}`, url: null } } : { json: { id: `m${++media}`, url: "https://x/m.jpg" } };
    if (pathname === "/api/v1/media" && req.method === "POST") return { json: { id: `m${++media}`, url: "https://x/m.jpg" } };
    if (pathname.startsWith("/api/v1/media/")) return left-- > 1 ? { status: 206, json: { id: "m1", url: null } } : { json: { id: "m1", url: "https://x/m.jpg" } };
    if (pathname === "/api/v1/statuses") return { json: { id: "1", url: `${ORIGIN}/@me/1` } };
    return undefined;
  };
  return server;
}

let rig: Rig;
afterEach(() => rig?.restore());

function make(options: RigOptions, kind: FediverseKind = "mastodon") {
  rig = fakeApi(options);
  const waits: number[] = [];
  const service = createFediverse(rig.api, createVault(rig.api.secrets), kind, async (ms) => void waits.push(ms));
  return { service, waits };
}

const jpeg = (alt = "") => ({ blob: new Blob([new Uint8Array([9, 9])], { type: "image/jpeg" }), width: 10, height: 10, alt });

describe("originOf", () => {
  it("reads an instance from what people type", () => {
    expect(originOf("mastodon.social")).toBe("https://mastodon.social");
    expect(originOf(" https://pixelfed.social/ ")).toBe("https://pixelfed.social");
    expect(originOf("@me@mastodon.social")).toBe("https://mastodon.social");
    expect(originOf("http://insecure.example")).toBeNull();
    expect(originOf("not an address")).toBeNull();
  });
});

describe("Mastodon sign-in", () => {
  it("registers Safelight, signs in through the browser with PKCE, and keeps the token", async () => {
    const { service } = make({ server: mastodon() });
    await service.signIn("mastodon.example");

    expect(rig.asked).toEqual([ORIGIN]);
    const apps = rig.sent.find((r) => r.url === `${ORIGIN}/api/v1/apps`);
    expect(Object.fromEntries(apps?.form ?? [])).toEqual({
      client_name: "Safelight",
      redirect_uris: "http://127.0.0.1",
      scopes: "read:accounts write:media write:statuses",
      website: "https://github.com/anthonyreimche/SafeLight",
    });
    const page = rig.browserUrl();
    expect(`${page?.origin}${page?.pathname}`).toBe(`${ORIGIN}/oauth/authorize`);
    expect(page?.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:53682");
    expect(page?.searchParams.get("code_challenge_method")).toBe("S256");

    const token = rig.sent.find((r) => r.url === `${ORIGIN}/oauth/token`)?.form;
    expect(token?.get("code")).toBe("the-code");
    expect(token?.get("redirect_uri")).toBe("http://127.0.0.1:53682");
    expect(token?.get("code_verifier")).toHaveLength(86);

    expect(service.store.getState()).toMatchObject({ status: "signed-in", name: "@me@mastodon.example" });
    expect(rig.secrets.get("mastodon.token")).toBe("tok");
    expect(rig.settings.get(SETTINGS.mastodon)).toEqual({ origin: ORIGIN, acct: "@me@mastodon.example" });
  });

  it("reuses the registration on the next sign-in to the same instance", async () => {
    const { service } = make({ server: mastodon() });
    await service.signIn("mastodon.example");
    await service.signOut();
    await service.signIn("mastodon.example");
    expect(rig.sent.filter((r) => r.url.endsWith("/api/v1/apps"))).toHaveLength(1);
  });

  it("refuses an answer with another state", async () => {
    const { service } = make({ server: mastodon(), browser: () => ({ code: "x", state: "forged" }) });
    await service.signIn("mastodon.example");
    expect(service.store.getState()).toMatchObject({ status: "signed-out", message: expect.stringMatching(/didn't ask for/) });
    expect(rig.sent.some((r) => r.url.endsWith("/oauth/token"))).toBe(false);
  });

  it("says why when the person declines on the server's page", async () => {
    const { service } = make({ server: mastodon(), browser: () => ({ error: "access_denied", error_description: "The resource owner denied the request." }) });
    await service.signIn("mastodon.example");
    expect(service.store.getState().message).toMatch(/denied/);
  });

  it("asks for a usable address", async () => {
    const { service } = make({ server: mastodon() });
    await service.signIn("nope");
    expect(service.store.getState().message).toMatch(/mastodon\.social/);
    expect(rig.sent).toEqual([]);
  });

  it("stops when the person won't allow the address", async () => {
    const { service } = make({ server: mastodon(), refuse: [ORIGIN] });
    await service.signIn("mastodon.example");
    expect(service.store.getState().message).toMatch(/wasn't allowed/);
  });

  it("asks Pixelfed for its own scopes", async () => {
    const { service } = make({ server: mastodon() }, "pixelfed");
    await service.signIn("mastodon.example");
    expect(rig.sent.find((r) => r.url.endsWith("/api/v1/apps"))?.form?.get("scopes")).toBe("read write");
    expect(rig.secrets.get("pixelfed.token")).toBe("tok");
  });
});

describe("Mastodon posts", () => {
  it("uploads each photo with its description, then posts them", async () => {
    const { service } = make({ server: mastodon() });
    await service.signIn("mastodon.example");
    const result = await service.post([jpeg("A heron"), jpeg()], { text: "Marsh", visibility: "unlisted", warning: "Birds" });

    const uploads = rig.sent.filter((r) => r.url === `${ORIGIN}/api/v2/media`);
    expect(uploads).toHaveLength(2);
    expect(uploads[0].headers["Content-Type"]).toMatch(/^multipart\/form-data; boundary=/);
    const first = new TextDecoder().decode(uploads[0].body as Uint8Array);
    expect(first).toContain('name="file"; filename="photo-1.jpg"');
    expect(first).toContain('name="description"\r\n\r\nA heron\r\n');
    expect(new TextDecoder().decode(uploads[1].body as Uint8Array)).not.toContain('name="description"');

    const status = rig.sent.find((r) => r.url === `${ORIGIN}/api/v1/statuses`);
    expect(status?.headers["Idempotency-Key"]).toBeTruthy();
    expect(status?.json).toEqual({ status: "Marsh", media_ids: ["m1", "m2"], visibility: "unlisted", sensitive: true, spoiler_text: "Birds" });
    expect(result.url).toBe(`${ORIGIN}/@me/1`);
  });

  it("waits for a photo the server is still processing", async () => {
    const { service, waits } = make({ server: mastodon({ processing: 2 }) });
    await service.signIn("mastodon.example");
    await service.post([jpeg()], { text: "" });
    expect(waits).toEqual([1000, 1000]);
    expect(rig.sent.find((r) => r.url.endsWith("/statuses"))?.json).toMatchObject({ media_ids: ["m1"], sensitive: false });
  });

  it("falls back to the older media address", async () => {
    const { service } = make({ server: mastodon({ noV2Media: true }) });
    await service.signIn("mastodon.example");
    await service.post([jpeg()], { text: "" });
    expect(rig.sent.some((r) => r.url === `${ORIGIN}/api/v1/media` && r.method === "POST")).toBe(true);
  });

  it("reads the instance's limits and refuses a post over them", async () => {
    const instance = { configuration: { statuses: { max_characters: 1000, max_media_attachments: 2 }, media_attachments: { image_size_limit: 10_485_760, image_matrix_limit: 16_777_216 } } };
    const { service } = make({ server: mastodon({ instance }) });
    await service.signIn("mastodon.example");
    expect(await service.limits()).toEqual({ maxPhotos: 2, maxText: 1000, maxBytes: 10_485_760, maxPixels: 16_777_216 });
    await expect(service.post([jpeg(), jpeg(), jpeg()], { text: "" })).rejects.toThrow(/2 photos/);
  });

  it("signs out on a revoked token", async () => {
    const { service } = make({ server: mastodon({ tokenStatus: 401 }) });
    rig.settings.set(SETTINGS.mastodon, { origin: ORIGIN, acct: "@me@mastodon.example" });
    rig.secrets.set("mastodon.token", "old");
    await service.restore();
    await expect(service.post([jpeg()], { text: "" })).rejects.toThrow(/Sign in again/);
    expect(service.store.getState().status).toBe("signed-out");
  });
});
