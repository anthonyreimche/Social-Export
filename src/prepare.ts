// Social Export — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// Turns catalogue photos into the files a destination takes. Each photo is
// rendered through its edit with the person's export settings (sharpening, a
// watermark) as an sRGB PNG, rendered again where its frame needs a size the
// first render can't give well, drawn into its frame, and encoded as a JPEG
// small enough for the service.

import type { Destination, Fit } from "./config";
import { type FramePlan, firstRenderEdge, planFrame, rerenderEdge } from "./plan";
import type { CatalogPhoto, ExportSettings, RenderedPhoto } from "./safelight";

/** A framed photo, ready to encode. */
export interface Surface {
  width: number;
  height: number;
  /** Encode at `quality`, drawn at `scale` of the surface's size. */
  encode(type: "image/jpeg" | "image/png", quality: number, scale: number): Promise<Blob>;
  release(): void;
}

export interface Imaging {
  /** Draw the rendered image as `plan` says, over `background`. */
  compose(image: Blob, plan: FramePlan, background: string): Promise<Surface>;
}

export interface PreparedPhoto {
  photo: CatalogPhoto;
  name: string;
  blob: Blob;
  width: number;
  height: number;
}

export interface Failure {
  name: string;
  reason: string;
}

export interface PrepareDeps {
  render(photos: CatalogPhoto[], settings: Partial<ExportSettings>): Promise<RenderedPhoto[]>;
  imaging: Imaging;
  /** The name a photo is shown by; its filename by default. */
  nameOf?(photo: CatalogPhoto): string;
  signal?: AbortSignal;
  onProgress?(done: number, total: number): void;
}

const QUALITIES = [0.92, 0.86, 0.8, 0.74, 0.68, 0.6];
const MAX_SHRINKS = 4;
const RENDER_FAILED = "Safelight couldn't render it.";

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The JPEG of `surface` at the best quality, then the largest size, that
 *  keeps under `maxBytes`. */
export async function fitToBytes(
  surface: Surface,
  maxBytes: number,
): Promise<{ blob: Blob; width: number; height: number; quality: number }> {
  let scale = 1;
  for (let shrink = 0; shrink <= MAX_SHRINKS; shrink++) {
    let size = 0;
    for (const quality of QUALITIES) {
      const blob = await surface.encode("image/jpeg", quality, scale);
      if (blob.size <= maxBytes)
        return { blob, width: Math.round(surface.width * scale), height: Math.round(surface.height * scale), quality };
      size = blob.size;
    }
    scale *= Math.sqrt(maxBytes / size) * 0.95;
  }
  throw new Error("It stays too large for the service even when made smaller.");
}

export function outputName(displayName: string, destinationId: string): string {
  const dot = displayName.lastIndexOf(".");
  const base = dot > 0 ? displayName.slice(0, dot) : displayName;
  return `${base}_${destinationId}.jpg`;
}

/** Render, frame and encode `photos` for `dest`, in order. A photo that fails
 *  is reported and the rest carry on. */
export async function preparePhotos(
  photos: CatalogPhoto[],
  dest: Destination,
  look: { fit: Fit; border: string },
  deps: PrepareDeps,
): Promise<{ ready: PreparedPhoto[]; failed: Failure[] }> {
  const nameOf = deps.nameOf ?? ((p: CatalogPhoto) => p.filename);
  const failed: Failure[] = [];
  const settings = (longEdge: number): Partial<ExportSettings> => ({ format: "image/png", colorSpace: "srgb", longEdge });

  const renders = new Map<string, RenderedPhoto>();
  for (const r of await deps.render(photos, settings(firstRenderEdge(dest)))) renders.set(r.photo.id, r);

  const again = new Map<number, CatalogPhoto[]>();
  for (const photo of photos) {
    const r = renders.get(photo.id);
    if (!r?.blob) continue;
    const edge = rerenderEdge(r.width, r.height, planFrame(dest, r.width, r.height, look.fit).scale);
    if (edge !== null) again.set(edge, [...(again.get(edge) ?? []), photo]);
  }
  for (const [edge, group] of again) {
    if (deps.signal?.aborted) break;
    for (const r of await deps.render(group, settings(edge))) if (r.blob) renders.set(r.photo.id, r);
  }

  const ready: PreparedPhoto[] = [];
  for (const [i, photo] of photos.entries()) {
    if (deps.signal?.aborted) break;
    const r = renders.get(photo.id);
    if (!r?.blob) {
      failed.push({ name: nameOf(photo), reason: RENDER_FAILED });
      deps.onProgress?.(i + 1, photos.length);
      continue;
    }
    let surface: Surface | null = null;
    try {
      surface = await deps.imaging.compose(r.blob, planFrame(dest, r.width, r.height, look.fit), look.border);
      const out = await fitToBytes(surface, dest.maxBytes);
      ready.push({ photo, name: outputName(nameOf(photo), dest.id), blob: out.blob, width: out.width, height: out.height });
    } catch (error) {
      failed.push({ name: nameOf(photo), reason: reasonOf(error) });
    } finally {
      surface?.release();
    }
    deps.onProgress?.(i + 1, photos.length);
  }
  return { ready, failed };
}
