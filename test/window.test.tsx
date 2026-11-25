import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SETTINGS } from "../src/config";
import { activate } from "../src/index";
import type { Imaging } from "../src/prepare";
import type { CatalogPhoto } from "../src/safelight";
import { MENU_ID, TOP_BAR_ID, WINDOW_ID } from "../src/service";
import { fakeApi, memoryFolder, resetFolders, type Rig, type RigOptions } from "./support/fake-api";

const imaging: Imaging = {
  compose: async (_b, plan) => ({ width: plan.width, height: plan.height, encode: async () => new Blob(["j"], { type: "image/jpeg" }), release: () => {} }),
};

const photo = (id: string, description?: string) =>
  ({ id, filename: `${id}.NEF`, width: 6000, height: 4000, thumbnailUrl: undefined, exif: description ? { imageDescription: description } : {} }) as unknown as CatalogPhoto;

let rig: Rig;
afterEach(() => {
  cleanup();
  rig?.restore();
  resetFolders();
});

function mount(options: RigOptions = {}) {
  rig = fakeApi({ photos: [photo("a", "A red barn"), photo("b")], target: ["a"], ...options });
  activate(rig.api, { imaging, copy: async () => {} });
  const Window = rig.windows[0].component;
  render(<Window />);
}

const flush = () => act(async () => {});

describe("activate", () => {
  it("registers the Share window, its menu item and a top-bar button", () => {
    rig = fakeApi();
    activate(rig.api, { imaging });
    expect(rig.windows.map((w) => [w.id, w.title])).toEqual([[WINDOW_ID, "Share"]]);
    expect(rig.menu[0].id).toBe(MENU_ID);
    expect(typeof rig.menu[0].label === "function" && rig.menu[0].label(["a", "b"])).toBe("Share 2 photos…");
    expect(rig.topBar[0]).toMatchObject({ id: TOP_BAR_ID, label: "Share" });
    expect(rig.topBar[0].svg.startsWith("<svg")).toBe(true);
  });

  it("opens the window from the menu, for the photos it was given", async () => {
    mount();
    act(() => rig.menu[0].onClick(["b"]));
    expect(rig.members.windows.isOpen(WINDOW_ID)).toBe(true);
    await flush();
    expect(screen.getByText("b.NEF")).toBeTruthy();
    expect(screen.queryByText("a.NEF")).toBeNull();
  });
});

describe("Share window", () => {
  it("shares the photo open in Develop when nothing is selected", () => {
    mount({ target: [], active: "b" });
    expect(screen.getByText("b.NEF")).toBeTruthy();
  });

  it("asks for photos when none are targeted", () => {
    mount({ target: [] });
    expect(screen.getByText(/Select photos in the Library/)).toBeTruthy();
  });

  it("starts at Instagram with a border, and saves and opens it", async () => {
    mount({ pickFolder: "Social" });
    expect((screen.getByLabelText("Destination") as HTMLSelectElement).value).toBe("instagram");
    fireEvent.click(screen.getByText("Save and open Instagram"));
    await flush();
    await flush();
    expect([...memoryFolder("Social").files.keys()]).toEqual(["a_instagram.jpg"]);
    expect(rig.opened).toEqual(["https://www.instagram.com/"]);
    expect(screen.getByText(/Saved 1 photo for Instagram/)).toBeTruthy();
  });

  it("remembers the destination and shows the crop choice only where the shape is limited", () => {
    mount();
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "x" } });
    expect(rig.settings.get(SETTINGS.destination)).toBe("x");
    expect(screen.queryByText("Crop")).toBeNull();
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "instagram-square" } });
    fireEvent.click(screen.getByText("Crop"));
    expect(rig.settings.get(SETTINGS.fit)).toBe("crop");
    expect(screen.queryByText("Black")).toBeNull();
  });

  it("asks for a Bluesky sign-in before posting, with alt text from the caption", () => {
    mount();
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "bluesky" } });
    expect((screen.getByLabelText("Alt text for a.NEF") as HTMLTextAreaElement).value).toBe("A red barn");
    expect((screen.getByRole("button", { name: "Post" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText("App password")).toBeTruthy();
    expect(screen.getByText("0 / 300")).toBeTruthy();
    expect(screen.queryByLabelText("Content warning")).toBeNull();
  });

  it("offers Mastodon's visibility and content warning, and a server to sign in to", () => {
    mount();
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "mastodon" } });
    expect(screen.getByLabelText("Server")).toBeTruthy();
    expect(screen.getByLabelText("Who can see it")).toBeTruthy();
    expect(screen.getByLabelText("Content warning")).toBeTruthy();
  });

  it("copies only one photo at a time", async () => {
    mount({ target: ["a", "b"] });
    await flush();
    expect((screen.getByText("Copy") as HTMLButtonElement).disabled).toBe(true);
  });
});
