// Social Export — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// One share from the window: check what the service allows, prepare the
// photos, and deliver them (post, save and open the site, save, or copy),
// telling the person how it goes in the app's notices.

import { type Destination, type Fit } from "./config";
import { ServiceError, reasonOf } from "./http";
import type { Poster, PostOptions } from "./poster";
import { type Failure, type Imaging, type PreparedPhoto, preparePhotos } from "./prepare";
import { graphemeCount } from "./richtext";
import type { CatalogPhoto, SafelightAPI } from "./safelight";
import type { Saver } from "./save";

export type Action = "post" | "save-open" | "save" | "copy";

export interface ShareRequest {
  photos: CatalogPhoto[];
  destination: Destination;
  fit: Fit;
  border: string;
  /** Alt text by photo id. */
  alt: Record<string, string>;
  post: PostOptions;
}

export interface ShareResult {
  ok: boolean;
  message: string;
  /** The post's address, after a post. */
  url?: string | null;
  failed: Failure[];
}

export interface ShareDeps {
  api: SafelightAPI;
  imaging: Imaging;
  saver: Saver;
  posters: Partial<Record<string, Poster>>;
  /** Put an image on the clipboard. */
  copy(image: Blob): Promise<void>;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface NoticeOptions {
  message: string;
  tone?: "info" | "success" | "warning" | "error";
  progress?: number | null;
}
interface NoticeHandle {
  update(next: Partial<NoticeOptions>): void;
  close(): void;
}

const SILENT: NoticeHandle = { update: () => {}, close: () => {} };

/** The app's notices (`api.ui.notify`, Safelight 3.2.8); before that, the
 *  window's own status line is all there is. */
function noticeOf(api: SafelightAPI): (notice: NoticeOptions) => NoticeHandle {
  const ui: typeof api.ui & { notify?: (n: NoticeOptions) => NoticeHandle } = api.ui;
  return "notify" in ui && typeof ui.notify === "function" ? (n) => ui.notify?.(n) ?? SILENT : () => SILENT;
}

export function createSharer({ api, imaging, saver, posters, copy }: ShareDeps) {
  const store = api.stores.create<{ busy: Action | null; last: ShareResult | null }>()(() => ({ busy: null, last: null }));
  let controller: AbortController | null = null;

  async function deliver(action: Action, req: ShareRequest, ready: PreparedPhoto[], poster: Poster | undefined): Promise<Omit<ShareResult, "failed">> {
    const service = req.destination.service;
    if (action === "post") {
      if (!poster) throw new Error(`${service} takes posts from Safelight in a later version. Use Save and open.`);
      const images = ready.map((r) => ({ blob: r.blob, width: r.width, height: r.height, alt: req.alt[r.photo.id] ?? "" }));
      const { url } = await poster.post(images, { ...req.post, signal: controller?.signal });
      return { ok: true, message: `Posted ${plural(ready.length, "photo")} to ${service}.`, url };
    }
    if (action === "copy") {
      await copy(ready[0].blob);
      return { ok: true, message: `Copied, sized for ${service}. Paste it into your post.` };
    }
    const saved = await saver.save(ready.map((r) => ({ name: r.name, blob: r.blob })));
    if (!saved) return { ok: false, message: "Nothing was saved: no folder was chosen." };
    if (saved.firstPath) await api.project.reveal(saved.firstPath);
    if (action === "save-open" && req.destination.delivery.kind === "site") window.open(req.destination.delivery.url, "_blank");
    return { ok: true, message: `Saved ${plural(saved.names.length, "photo")} for ${service} in ${saved.folderName}.` };
  }

  /** Refuses what the service won't take, before anything is rendered. */
  async function check(action: Action, req: ShareRequest, poster: Poster | undefined): Promise<Destination> {
    if (!req.photos.length) throw new Error("Select the photos to share first.");
    if (action === "copy" && req.photos.length > 1) throw new Error("Copy takes one photo at a time.");
    if (action !== "post" || !poster) return req.destination;
    if (poster.store.getState().status !== "signed-in") throw new Error(`Sign in to ${req.destination.service} first.`);
    const limits = await poster.limits();
    if (req.photos.length > limits.maxPhotos) throw new Error(`A ${req.destination.service} post takes ${limits.maxPhotos} photos at most.`);
    if (graphemeCount(req.post.text.trim()) > limits.maxText) throw new Error(`${req.destination.service} takes ${limits.maxText} characters at most.`);
    return { ...req.destination, maxBytes: Math.min(req.destination.maxBytes, limits.maxBytes), maxPixels: limits.maxPixels ?? req.destination.maxPixels };
  }

  async function run(action: Action, req: ShareRequest): Promise<ShareResult> {
    if (store.getState().busy) return { ok: false, message: "A share is already under way.", failed: [] };
    const poster = req.destination.delivery.kind === "post" ? posters[req.destination.delivery.service] : undefined;
    controller = new AbortController();
    store.setState({ busy: action, last: null });
    const notice = noticeOf(api)({ message: `Preparing ${plural(req.photos.length, "photo")} for ${req.destination.service}…`, progress: 0 });
    let result: ShareResult;
    try {
      const destination = await check(action, req, poster);
      const prepared = await preparePhotos(req.photos, destination, { fit: req.fit, border: req.border }, {
        render: (photos, settings) => api.export.renderPhotos(photos, settings, undefined, { signal: controller?.signal }),
        imaging,
        nameOf: (p) => api.catalog.photoDisplayName(p),
        signal: controller.signal,
        onProgress: (done, total) => notice.update({ progress: (done / total) * (action === "post" ? 0.5 : 0.9) }),
      });
      if (controller.signal.aborted) throw new ServiceError("cancelled", "Stopped.");
      if (!prepared.ready.length) throw new Error(prepared.failed[0]?.reason ?? "Nothing could be prepared.");
      if (action === "post" && prepared.failed.length) throw new Error(`${prepared.failed.length} of the photos couldn't be prepared, so nothing was posted: ${prepared.failed[0].reason}`);
      if (action === "post") notice.update({ message: `Posting to ${req.destination.service}…`, progress: 0.6 });
      // Uploads stop on Stop; the post itself, once sent, isn't taken back.
      result = { ...(await deliver(action, req, prepared.ready, poster)), failed: prepared.failed };
      if (prepared.failed.length) result.message += ` ${plural(prepared.failed.length, "photo")} couldn't be prepared.`;
    } catch (error) {
      const stopped = error instanceof ServiceError && error.kind === "cancelled";
      result = { ok: false, message: stopped ? "Stopped." : reasonOf(error), failed: [] };
    }
    notice.update({ message: result.message, progress: null, tone: result.ok ? (result.failed.length ? "warning" : "success") : "error" });
    store.setState({ busy: null, last: result });
    controller = null;
    return result;
  }

  return { store, run, cancel: () => controller?.abort() };
}

export type Sharer = ReturnType<typeof createSharer>;

/** Chromium's clipboard takes images as PNG only. */
export async function copyToClipboard(png: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
