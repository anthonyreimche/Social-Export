import { describe, expect, it } from "vitest";
import { destinationById } from "../src/config";
import { firstRenderEdge, planFrame, rerenderEdge } from "../src/plan";

const insta = destinationById("instagram");
const portrait = destinationById("instagram-portrait");
const story = destinationById("instagram-story");
const square = destinationById("instagram-square");
const bluesky = destinationById("bluesky");
const mastodon = destinationById("mastodon");

describe("planFrame", () => {
  it("keeps a photo inside Instagram's range at its own shape, 1080 wide", () => {
    const p = planFrame(insta, 1350, 1080, "border");
    expect(p).toMatchObject({ width: 1080, height: 864, draw: { x: 0, y: 0, w: 1080, h: 864 } });
    expect(p.scale).toBeCloseTo(0.8);
  });

  it("borders a 2:3 portrait to Instagram's tallest shape, 4:5", () => {
    const p = planFrame(insta, 900, 1350, "border");
    expect(p.width).toBe(1080);
    expect(p.height).toBe(1350);
    expect(p.draw.h).toBeCloseTo(1350);
    expect(p.draw.w).toBeCloseTo(900);
    expect(p.draw.x).toBeCloseTo(90);
    expect(p.draw.y).toBeCloseTo(0);
  });

  it("crops a 2:3 portrait to fill 4:5 from its centre", () => {
    const p = planFrame(portrait, 900, 1350, "crop");
    expect(p.width).toBe(1080);
    expect(p.height).toBe(1350);
    expect(p.draw.w).toBeCloseTo(1080);
    expect(p.draw.h).toBeCloseTo(1620);
    expect(p.draw.y).toBeCloseTo(-135);
    expect(p.scale).toBeCloseTo(1.2);
  });

  it("borders a landscape inside a story frame", () => {
    const p = planFrame(story, 1920, 1280, "border");
    expect([p.width, p.height]).toEqual([1080, 1920]);
    expect(p.draw.w).toBeCloseTo(1080);
    expect(p.draw.h).toBeCloseTo(720);
    expect(p.draw.y).toBeCloseTo(600);
  });

  it("makes a square from a square photo without a border", () => {
    const p = planFrame(square, 1080, 1080, "border");
    expect(p.draw).toEqual({ x: 0, y: 0, w: 1080, h: 1080 });
  });

  it("sizes a free destination by its long edge, either way round", () => {
    expect(planFrame(bluesky, 3000, 2000, "border")).toMatchObject({ width: 2000, height: 1333 });
    expect(planFrame(bluesky, 2000, 3000, "border")).toMatchObject({ width: 1333, height: 2000 });
  });

  it("never enlarges a photo smaller than a free destination's size", () => {
    expect(planFrame(bluesky, 1200, 800, "border")).toMatchObject({ width: 1200, height: 800, scale: 1 });
  });

  it("keeps under a pixel limit", () => {
    const p = planFrame({ ...mastodon, maxPixels: 1_000_000 }, 3840, 2560, "border");
    expect(p.width * p.height).toBeLessThanOrEqual(1_000_000);
    expect(p.width / p.height).toBeCloseTo(1.5, 2);
  });
});

describe("render sizes", () => {
  it("first renders at the tallest frame the destination allows", () => {
    expect(firstRenderEdge(insta)).toBe(1350);
    expect(firstRenderEdge(story)).toBe(1920);
    expect(firstRenderEdge(square)).toBe(1080);
    expect(firstRenderEdge(bluesky)).toBe(2000);
  });

  it("renders again when the plan needs more pixels, or far fewer", () => {
    expect(rerenderEdge(900, 1350, 1.2)).toBe(1620);
    expect(rerenderEdge(1920, 1280, 0.5625)).toBe(1080);
    expect(rerenderEdge(1350, 1080, 0.8)).toBeNull();
    expect(rerenderEdge(1080, 1080, 1)).toBeNull();
  });
});
