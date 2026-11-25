import { afterEach, describe, expect, it } from "vitest";
import { createBluesky, pdsOf } from "../src/bluesky";
import { SETTINGS } from "../src/config";
import { createVault } from "../src/vault";
import { fakeApi, type Rig, type RigOptions, type Sent } from "./support/fake-api";

const PDS = "https://morel.us-east.host.bsky.network";
const didDoc = { id: "did:plc:abc", service: [{ id: "#atproto_pds", type: "AtprotoPersonalDataServer", serviceEndpoint: PDS }] };

/** A Bluesky that knows one account, me.bsky.social with app password
 *  "app-pass", and whose access tokens expire when `expired` says. */
function bluesky(extra: { expired?: () => boolean; refreshRefused?: boolean } = {}) {
  let n = 0;
  let refreshes = 0;
  const server = (req: Sent) => {
    const path = new URL(req.url).pathname;
    if (path.endsWith("createSession")) {
      const { identifier, password } = req.json as { identifier: string; password: string };
      if (identifier === "me.bsky.social" && password === "app-pass")
        return { json: { accessJwt: "access-1", refreshJwt: "refresh-1", handle: "me.bsky.social", did: "did:plc:abc", didDoc } };
      if (password === "main-pass") return { status: 401, json: { error: "AuthFactorTokenRequired", message: "A sign in code has been sent" } };
      return { status: 401, json: { error: "AuthenticationRequired", message: "Invalid identifier or password" } };
    }
    if (path.endsWith("refreshSession")) {
      if (extra.refreshRefused) return { status: 400, json: { error: "ExpiredToken", message: "Token has expired" } };
      refreshes++;
      return { json: { accessJwt: `access-r${refreshes}`, refreshJwt: `refresh-r${refreshes}`, handle: "me.bsky.social", did: "did:plc:abc", didDoc } };
    }
    if (extra.expired?.() && req.headers.Authorization === "Bearer access-1") return { status: 400, json: { error: "ExpiredToken", message: "Token has expired" } };
    if (path.endsWith("uploadBlob")) return { json: { blob: { $type: "blob", ref: { $link: `cid${++n}` }, mimeType: "image/jpeg", size: 3 } } };
    if (path.endsWith("createRecord")) return { json: { uri: "at://did:plc:abc/app.bsky.feed.post/3kpost", cid: "c" } };
    return undefined;
  };
  return { server, refreshes: () => refreshes };
}

let rig: Rig;
afterEach(() => rig?.restore());

function make(options: RigOptions) {
  rig = fakeApi(options);
  return createBluesky(rig.api, createVault(rig.api.secrets));
}

const jpeg = (w = 1600, h = 1200, alt = "") => ({ blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), width: w, height: h, alt });

describe("pdsOf", () => {
  it("finds the PDS a DID document names", () => {
    expect(pdsOf(didDoc)).toBe(PDS);
    expect(pdsOf({ service: [] })).toBeNull();
    expect(pdsOf(null)).toBeNull();
  });
});

describe("Bluesky sign-in", () => {
  it("signs in with an app password and keeps the refresh token in the keychain", async () => {
    const bs = make({ server: bluesky().server });
    await bs.signIn("@me.bsky.social", "app-pass");
    expect(bs.store.getState()).toMatchObject({ status: "signed-in", name: "@me.bsky.social", remembered: true });
    expect(rig.sent[0].url).toBe("https://bsky.social/xrpc/com.atproto.server.createSession");
    expect(rig.secrets.get("bluesky.refresh")).toBe("refresh-1");
    expect(rig.settings.get(SETTINGS.bluesky)).toEqual({ handle: "me.bsky.social", did: "did:plc:abc", pds: PDS });
    expect(rig.asked).toEqual(["https://bsky.social", PDS]);
  });

  it("reads the hosting provider however it's typed, and refuses plain http", async () => {
    const bs = make({ server: bluesky().server });
    await bs.signIn("me.bsky.social", "app-pass", "bsky.social/");
    expect(rig.sent[0].url).toBe("https://bsky.social/xrpc/com.atproto.server.createSession");
    await bs.signOut();
    const before = rig.sent.length;
    await bs.signIn("me.bsky.social", "app-pass", "http://pds.example");
    expect(bs.store.getState().message).toMatch(/https address/);
    expect(rig.sent.length).toBe(before);
  });

  it("says so when the password is wrong, or is the main one", async () => {
    const bs = make({ server: bluesky().server });
    await bs.signIn("me.bsky.social", "nope");
    expect(bs.store.getState()).toMatchObject({ status: "signed-out", message: expect.stringMatching(/didn't accept/) });
    await bs.signIn("me.bsky.social", "main-pass");
    expect(bs.store.getState().message).toMatch(/app password/);
  });

  it("lasts the session only where there is no keychain", async () => {
    const bs = make({ server: bluesky().server, keychain: false });
    await bs.signIn("me.bsky.social", "app-pass");
    expect(bs.store.getState()).toMatchObject({ status: "signed-in", remembered: false });
  });

  it("takes up a kept sign-in at launch", async () => {
    const bs = make({ server: bluesky().server });
    rig.settings.set(SETTINGS.bluesky, { handle: "me.bsky.social", did: "did:plc:abc", pds: PDS });
    rig.secrets.set("bluesky.refresh", "refresh-0");
    await bs.restore();
    expect(bs.store.getState()).toMatchObject({ status: "signed-in", name: "@me.bsky.social" });
  });

  it("forgets the account on sign-out", async () => {
    const bs = make({ server: bluesky().server });
    await bs.signIn("me.bsky.social", "app-pass");
    await bs.signOut();
    expect(bs.store.getState().status).toBe("signed-out");
    expect(rig.secrets.has("bluesky.refresh")).toBe(false);
    expect(rig.settings.get(SETTINGS.bluesky)).toBeNull();
  });
});

describe("Bluesky posts", () => {
  it("uploads each photo to the PDS, then posts them with alt text, shape and facets", async () => {
    const bs = make({ server: bluesky().server });
    await bs.signIn("me.bsky.social", "app-pass");
    const result = await bs.post([jpeg(1600, 1200, "A red barn"), jpeg(1200, 1600)], { text: " Evening #film " });
    const uploads = rig.sent.filter((r) => r.url.endsWith("uploadBlob"));
    expect(uploads.map((u) => u.url)).toEqual([`${PDS}/xrpc/com.atproto.repo.uploadBlob`, `${PDS}/xrpc/com.atproto.repo.uploadBlob`]);
    expect(uploads[0].headers).toMatchObject({ "Content-Type": "image/jpeg", Authorization: "Bearer access-1" });
    const record = rig.sent.find((r) => r.url.endsWith("createRecord"))?.json as { repo: string; record: Record<string, unknown> };
    expect(record.repo).toBe("did:plc:abc");
    expect(record.record).toMatchObject({
      $type: "app.bsky.feed.post",
      text: "Evening #film",
      facets: [{ index: { byteStart: 8, byteEnd: 13 }, features: [{ tag: "film" }] }],
      embed: {
        $type: "app.bsky.embed.images",
        images: [
          { image: { ref: { $link: "cid1" } }, alt: "A red barn", aspectRatio: { width: 1600, height: 1200 } },
          { image: { ref: { $link: "cid2" } }, alt: "", aspectRatio: { width: 1200, height: 1600 } },
        ],
      },
    });
    expect(result.url).toBe("https://bsky.app/profile/me.bsky.social/post/3kpost");
  });

  it("refuses more than four photos before sending anything", async () => {
    const bs = make({ server: bluesky().server });
    await bs.signIn("me.bsky.social", "app-pass");
    const before = rig.sent.length;
    await expect(bs.post([jpeg(), jpeg(), jpeg(), jpeg(), jpeg()], { text: "" })).rejects.toThrow(/4 photos/);
    expect(rig.sent.length).toBe(before);
  });

  it("refreshes an expired access token once and carries on", async () => {
    const b = bluesky({ expired: () => true });
    const bs = make({ server: b.server });
    await bs.signIn("me.bsky.social", "app-pass");
    await bs.post([jpeg()], { text: "hi" });
    expect(b.refreshes()).toBe(1);
    expect(rig.secrets.get("bluesky.refresh")).toBe("refresh-r1");
  });

  it("refreshes a kept sign-in before its first call", async () => {
    const b = bluesky();
    const bs = make({ server: b.server });
    rig.settings.set(SETTINGS.bluesky, { handle: "me.bsky.social", did: "did:plc:abc", pds: PDS });
    rig.secrets.set("bluesky.refresh", "refresh-0");
    await bs.restore();
    await bs.post([jpeg()], { text: "" });
    const refresh = rig.sent.find((r) => r.url.endsWith("refreshSession"));
    expect(refresh?.headers.Authorization).toBe("Bearer refresh-0");
  });

  it("signs out when the refresh is refused", async () => {
    const bs = make({ server: bluesky({ expired: () => true, refreshRefused: true }).server });
    await bs.signIn("me.bsky.social", "app-pass");
    await expect(bs.post([jpeg()], { text: "" })).rejects.toThrow(/Sign in again/);
    expect(bs.store.getState()).toMatchObject({ status: "signed-out", message: expect.stringMatching(/Sign in again/) });
  });
});
