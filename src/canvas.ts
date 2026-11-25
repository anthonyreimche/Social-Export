// Social Export — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// The browser's half of prepare.ts: frames a render on an OffscreenCanvas and
// encodes it. The canvas is sRGB, as the render is.

import type { FramePlan } from "./plan";
import type { Imaging, Surface } from "./prepare";

function context(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("This computer couldn't make a canvas to draw on.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

export const canvasImaging: Imaging = {
  async compose(image: Blob, plan: FramePlan, background: string): Promise<Surface> {
    const bitmap = await createImageBitmap(image);
    const canvas = new OffscreenCanvas(plan.width, plan.height);
    try {
      const ctx = context(canvas);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, plan.width, plan.height);
      ctx.drawImage(bitmap, plan.draw.x, plan.draw.y, plan.draw.w, plan.draw.h);
    } finally {
      bitmap.close();
    }
    return {
      width: plan.width,
      height: plan.height,
      async encode(type, quality, scale) {
        if (scale >= 1) return canvas.convertToBlob({ type, quality });
        const small = new OffscreenCanvas(Math.max(1, Math.round(plan.width * scale)), Math.max(1, Math.round(plan.height * scale)));
        context(small).drawImage(canvas, 0, 0, small.width, small.height);
        return small.convertToBlob({ type, quality });
      },
      release() {
        canvas.width = 0;
        canvas.height = 0;
      },
    };
  },
};

/** A JPEG as a PNG, for the clipboard: Chromium's clipboard takes PNG only. */
export async function toPng(jpeg: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(jpeg);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  try {
    context(canvas).drawImage(bitmap, 0, 0);
  } finally {
    bitmap.close();
  }
  return canvas.convertToBlob({ type: "image/png" });
}
