// Social Export — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// Where a rendered photo goes in the file a destination takes: the file's
// size, and the rectangle the photo is drawn into (past the edges when
// cropped, inside a border when not).

import type { Destination, Fit } from "./config";

export interface FramePlan {
  width: number;
  height: number;
  draw: { x: number; y: number; w: number; h: number };
  /** Drawn size over rendered size. */
  scale: number;
}

/** Shapes this close count as the same: rounding, not a border. */
const SAME_SHAPE = 0.005;
/** A downscale past this loses the export's sharpening: render again. */
const MIN_SCALE = 0.75;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function outputSize(dest: Destination, aspect: number, sw: number, sh: number, free: boolean): [number, number] {
  let w: number;
  let h: number;
  if (dest.width) {
    w = dest.width;
    h = Math.round(w / aspect);
  } else {
    const long = dest.longEdge ?? Math.max(sw, sh);
    [w, h] = aspect >= 1 ? [long, Math.round(long / aspect)] : [Math.round(long * aspect), long];
    if (free && Math.max(sw, sh) < long) [w, h] = [sw, sh];
  }
  if (dest.maxPixels && w * h > dest.maxPixels) {
    const k = Math.sqrt(dest.maxPixels / (w * h));
    [w, h] = [Math.floor(w * k), Math.floor(h * k)];
  }
  return [w, h];
}

/** The plan for a photo rendered at `sw` × `sh`. */
export function planFrame(dest: Destination, sw: number, sh: number, fit: Fit): FramePlan {
  const aspect = sw / sh;
  const target = clamp(aspect, dest.minAspect, dest.maxAspect);
  const free = Math.abs(target / aspect - 1) <= SAME_SHAPE;
  const [width, height] = outputSize(dest, free ? aspect : target, sw, sh, free);
  if (free) return { width, height, draw: { x: 0, y: 0, w: width, h: height }, scale: width / sw };
  const scale = fit === "crop" ? Math.max(width / sw, height / sh) : Math.min(width / sw, height / sh);
  const w = sw * scale;
  const h = sh * scale;
  return { width, height, draw: { x: (width - w) / 2, y: (height - h) / 2, w, h }, scale };
}

/** The long edge to render at first: the longest side any photo's file can
 *  have at this destination. */
export function firstRenderEdge(dest: Destination): number {
  if (dest.width) return Math.round(dest.width / Math.min(1, dest.minAspect || 1));
  return dest.longEdge ?? 2048;
}

/** The long edge to render at again for a plan drawing the `sw` × `sh` render
 *  at `scale`, or null when the render will do. */
export function rerenderEdge(sw: number, sh: number, scale: number): number | null {
  if (scale > 1 + SAME_SHAPE || scale < MIN_SCALE) return Math.ceil(Math.max(sw, sh) * scale);
  return null;
}
