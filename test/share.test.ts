import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";
import { destinationById, SETTINGS } from "../src/config";
import type { Poster, PostImage, PostOptions } from "../src/poster";
import type { Imaging } from "../src/prepare";
import type { CatalogPhoto } from "../src/safelight";
import { createSaver } from "../src/save";
import { createSharer, type ShareRequest } from "../src/share";
import { SIGNED_OUT, type AccountState } from "../src/vault";
import { fakeApi, memoryFolder, resetFolders, type Rig } from "./support/fake-api";

const imaging: Imaging = {
  compose: async (_b, plan) => ({
    width: plan.width,
    height: plan.height,
    encode: async () => new Blob([new Uint8Array(10)], { type: "image/jpeg" }),
    release: () => {},
  }),
};

const photo = (id: string) => ({ id, filename: `${id}.NEF`, width: 6000, height: 4000, exif: {} }) as unknown as CatalogPhoto;

function poster(signedIn = true) {
  const posts: { images: PostImage[]; options: PostOptions }[] = [];
  const store = create<AccountState>()(() => (signedIn ? { status: "signed-in", name: "@me", message: null, remembered: true } : SIGNED_OUT));
  const p: Poster = {
    id: "bluesky",
    store,
    restore: async () => {},
    signOut: async () => {},
    limits: async () => ({ maxPhotos: 4, maxText: 10, maxBytes: 2_000_000 }),
    post: async (images, options) => {
      posts.push({ images, options });
      return { url: "https://bsky.app/profile/me/post/1" };
    },
  };
  return { p, posts };
}

let rig: Rig;
let copied: Blob[];
beforeEach(() => {
  resetFolders();
  copied = [];
});
afterEach(() => rig?.restore());

function sharer(opts: { pickFolder?: string; poster?: Poster } = {}) {
  rig = fakeApi({ pickFolder: opts.pickFolder });
  return createSharer({
    api: rig.api,
    imaging,
    saver: createSaver(rig.api),
    posters: opts.poster ? { bluesky: opts.poster } : {},
    copy: async (b) => void copied.push(b),
  });
}

const request = (dest: string, photos: CatalogPhoto[], extra: Partial<ShareRequest> = {}): ShareRequest => ({
  photos,
  destination: destinationById(dest),
  fit: "border",
  border: "#ffffff",
  alt: {},
  post: { text: "" },
  ...extra,
});

describe("Save and open", () => {
  it("saves into a folder picked once, shows the file and opens the site", async () => {
    const s = sharer({ pickFolder: "Social" });
    const result = await s.run("save-open", request("instagram", [photo("a"), photo("b")]));
    expect(result).toMatchObject({ ok: true, message: "Saved 2 photos for Instagram in Social." });
    expect([...memoryFolder("Social").files.keys()]).toEqual(["a_instagram.jpg", "b_instagram.jpg"]);
    expect(rig.revealed).toEqual(["C:\\Shared\\Social\\a_instagram.jpg"]);
    expect(rig.opened).toEqual(["https://www.instagram.com/"]);
    expect(rig.settings.get(SETTINGS.folder)).toBe("token-1");

    await s.run("save-open", request("instagram", [photo("a")]));
    expect(rig.picks).toEqual([null]);
    expect([...memoryFolder("Social").files.keys()]).toContain("a_instagram (2).jpg");
  });

  it("saves nothing, and says so, when no folder is chosen", async () => {
    const s = sharer();
    const result = await s.run("save", request("x", [photo("a")]));
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/no folder/) });
    expect(rig.opened).toEqual([]);
  });

  it("Save writes without opening the site", async () => {
    const s = sharer({ pickFolder: "Social" });
    await s.run("save", request("x", [photo("a")]));
    expect(rig.opened).toEqual([]);
    expect(rig.revealed).toHaveLength(1);
  });

  it("renders as sRGB PNG at the destination's size and tells the person how it went", async () => {
    const s = sharer({ pickFolder: "Social" });
    await s.run("save", request("facebook", [photo("a")]));
    expect(rig.renders[0].settings).toEqual({ format: "image/png", colorSpace: "srgb", longEdge: 2048 });
    expect(rig.notices.at(-1)).toMatchObject({ tone: "success", progress: null, message: expect.stringMatching(/Saved 1 photo for Facebook/) });
  });
});

describe("on Safelight 3.2.7, without the app's notices", () => {
  it("still shares, and reports in its result", async () => {
    const s = sharer({ pickFolder: "Social" });
    delete (rig.members.ui as { notify?: unknown }).notify;
    expect(await s.run("save", request("x", [photo("a")]))).toMatchObject({ ok: true, message: expect.stringMatching(/Saved 1 photo for X/) });
  });
});

describe("Copy", () => {
  it("copies one photo", async () => {
    const s = sharer();
    expect(await s.run("copy", request("x", [photo("a")]))).toMatchObject({ ok: true });
    expect(copied).toHaveLength(1);
  });

  it("refuses several", async () => {
    const s = sharer();
    expect(await s.run("copy", request("x", [photo("a"), photo("b")]))).toMatchObject({ ok: false, message: expect.stringMatching(/one photo/) });
    expect(rig.renders).toEqual([]);
  });
});

describe("Post", () => {
  it("posts the prepared photos with their alt text and returns the post's address", async () => {
    const { p, posts } = poster();
    const s = sharer({ poster: p });
    const result = await s.run("post", request("bluesky", [photo("a"), photo("b")], { alt: { a: "Barn" }, post: { text: "Hi" } }));
    expect(result).toMatchObject({ ok: true, url: "https://bsky.app/profile/me/post/1", message: "Posted 2 photos to Bluesky." });
    expect(posts[0].images.map((i) => i.alt)).toEqual(["Barn", ""]);
    expect(posts[0].options.text).toBe("Hi");
  });

  it("checks sign-in, photo count and text length before rendering", async () => {
    for (const [p, req, why] of [
      [poster(false).p, request("bluesky", [photo("a")]), /Sign in/],
      [poster().p, request("bluesky", [1, 2, 3, 4, 5].map((n) => photo(`p${n}`))), /4 photos/],
      [poster().p, request("bluesky", [photo("a")], { post: { text: "far too long text" } }), /10 characters/],
    ] as const) {
      const s = sharer({ poster: p });
      expect(await s.run("post", req)).toMatchObject({ ok: false, message: expect.stringMatching(why) });
      expect(rig.renders).toEqual([]);
      rig.restore();
    }
  });

  it("posts nothing when a photo couldn't be prepared", async () => {
    const { p, posts } = poster();
    const s = sharer({ poster: p });
    rig.members.export.renderPhotos = async (photos) =>
      photos.map((ph) => (ph.id === "bad" ? { photo: ph, blob: null, width: 0, height: 0 } : { photo: ph, blob: new Blob(["x"]), width: 2000, height: 1000 }));
    const result = await s.run("post", request("bluesky", [photo("a"), photo("bad")]));
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/nothing was posted/) });
    expect(posts).toEqual([]);
  });
});
