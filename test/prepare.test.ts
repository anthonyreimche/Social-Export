import { describe, expect, it } from "vitest";
import { destinationById } from "../src/config";
import type { FramePlan } from "../src/plan";
import { type Imaging, type Surface, fitToBytes, outputName, preparePhotos } from "../src/prepare";
import type { CatalogPhoto, ExportSettings, RenderedPhoto } from "../src/safelight";

/** A surface whose JPEG weighs `bytesAt(quality, pixels)`. */
function surface(width: number, height: number, bytesAt: (q: number, px: number) => number): Surface & { calls: [number, number][] } {
  const calls: [number, number][] = [];
  return {
    width,
    height,
    calls,
    encode: async (_type, quality, scale) => {
      calls.push([quality, scale]);
      const px = Math.round(width * scale) * Math.round(height * scale);
      return new Blob([new Uint8Array(Math.round(bytesAt(quality, px)))], { type: "image/jpeg" });
    },
    release: () => {},
  };
}

describe("fitToBytes", () => {
  it("takes the first quality that fits", async () => {
    const s = surface(1000, 1000, (q) => q * 1000);
    const out = await fitToBytes(s, 900);
    expect(out.quality).toBe(0.86);
    expect(out.width).toBe(1000);
    expect(s.calls).toEqual([
      [0.92, 1],
      [0.86, 1],
    ]);
  });

  it("shrinks when the lowest quality is still too big", async () => {
    const s = surface(2000, 1000, (q, px) => (q * px) / 100);
    const out = await fitToBytes(s, 6000);
    expect(out.blob.size).toBeLessThanOrEqual(6000);
    expect(out.width).toBeLessThan(2000);
    expect(out.width / out.height).toBeCloseTo(2, 1);
  });

  it("gives up with a reason after a few shrinks", async () => {
    await expect(fitToBytes(surface(100, 100, () => 5000), 10)).rejects.toThrow(/too large/);
  });
});

describe("outputName", () => {
  it("names the file for the photo and the destination", () => {
    expect(outputName("DSC_0042.NEF", "instagram-square")).toBe("DSC_0042_instagram-square.jpg");
    expect(outputName("no extension", "x")).toBe("no extension_x.jpg");
  });
});

function photo(id: string, w: number, h: number): CatalogPhoto {
  return { id, filename: `${id}.NEF`, width: w, height: h, exif: {} } as unknown as CatalogPhoto;
}

describe("preparePhotos", () => {
  function rig(sizes: Record<string, [number, number]>) {
    const renders: { ids: string[]; settings: Partial<ExportSettings> }[] = [];
    const plans: FramePlan[] = [];
    const render = async (photos: CatalogPhoto[], settings: Partial<ExportSettings> = {}): Promise<RenderedPhoto[]> => {
      renders.push({ ids: photos.map((p) => p.id), settings });
      return photos.map((p) => {
        const size = sizes[p.id];
        if (!size) return { photo: p, blob: null, width: 0, height: 0 };
        const k = Math.min(1, (settings.longEdge ?? 1e9) / Math.max(...size));
        return { photo: p, blob: new Blob(["png"]), width: Math.round(size[0] * k), height: Math.round(size[1] * k) };
      });
    };
    const imaging: Imaging = {
      compose: async (_blob, plan) => {
        plans.push(plan);
        return surface(plan.width, plan.height, () => 100);
      },
    };
    return { render, imaging, renders, plans };
  }

  it("renders sRGB PNGs at the destination's size, then frames them", async () => {
    const r = rig({ a: [6000, 4000] });
    const out = await preparePhotos([photo("a", 6000, 4000)], destinationById("instagram"), { fit: "border", border: "#fff" }, r);
    expect(r.renders).toEqual([{ ids: ["a"], settings: { format: "image/png", colorSpace: "srgb", longEdge: 1350 } }]);
    expect(out.failed).toEqual([]);
    expect(out.ready[0]).toMatchObject({ name: "a_instagram.jpg", width: 1080, height: 720 });
  });

  it("renders again, together, the photos a crop needs bigger", async () => {
    const r = rig({ a: [4000, 6000], b: [4000, 6000], c: [4000, 5000] });
    const photos = [photo("a", 0, 0), photo("b", 0, 0), photo("c", 0, 0)];
    await preparePhotos(photos, destinationById("instagram-portrait"), { fit: "crop", border: "#fff" }, r);
    expect(r.renders.map((x) => [x.ids, x.settings.longEdge])).toEqual([
      [["a", "b", "c"], 1350],
      [["a", "b"], 1620],
    ]);
    expect(r.plans.every((p) => p.width === 1080 && p.height === 1350)).toBe(true);
  });

  it("reports a photo that wouldn't render and carries on", async () => {
    const r = rig({ b: [3000, 2000] });
    const out = await preparePhotos([photo("a", 1, 1), photo("b", 1, 1)], destinationById("bluesky"), { fit: "border", border: "#fff" }, r);
    expect(out.failed).toEqual([{ name: "a.NEF", reason: "Safelight couldn't render it." }]);
    expect(out.ready.map((x) => x.photo.id)).toEqual(["b"]);
  });
});
