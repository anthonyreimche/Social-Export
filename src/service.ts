// Social Export — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// One window's Social Export: the accounts, the saver and the sharer, and
// what they register with Safelight. Nothing reaches a service until the
// person signs in or shares.

import { createBluesky } from "./bluesky";
import { canvasImaging, toPng } from "./canvas";
import { EXTENSION_ID } from "./config";
import { createFediverse } from "./mastodon";
import type { Imaging } from "./prepare";
import type { SafelightAPI } from "./safelight";
import { createSaver } from "./save";
import { copyToClipboard, createSharer } from "./share";
import { createShareWindow } from "./ShareWindow";
import { createVault } from "./vault";

export const WINDOW_ID = `${EXTENSION_ID}.share`;
export const MENU_ID = `${EXTENSION_ID}.share`;
export const TOP_BAR_ID = `${EXTENSION_ID}.share`;

/** A box with an arrow leaving it. */
const SHARE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2.6l4.7 4.7-1.4 1.4L13 6.4V15h-2V6.4L8.7 8.7 7.3 7.3z"/><path d="M5 10h3v2H6v8h12v-8h-2v-2h3a1 1 0 011 1v10a1 1 0 01-1 1H5a1 1 0 01-1-1V11a1 1 0 011-1z"/></svg>';

export interface Deps {
  imaging?: Imaging;
  copy?(jpeg: Blob): Promise<void>;
}

export function createSocialExport(api: SafelightAPI, deps: Deps = {}) {
  const vault = createVault(api.secrets);
  const bluesky = createBluesky(api, vault);
  const mastodon = createFediverse(api, vault, "mastodon");
  const pixelfed = createFediverse(api, vault, "pixelfed");
  const saver = createSaver(api);
  const sharer = createSharer({
    api,
    imaging: deps.imaging ?? canvasImaging,
    saver,
    posters: { bluesky, mastodon, pixelfed },
    copy: deps.copy ?? (async (jpeg) => copyToClipboard(await toPng(jpeg))),
  });
  const pinned = api.stores.create<{ ids: string[] | null }>()(() => ({ ids: null }));

  function open(ids: string[] | null): void {
    pinned.setState({ ids });
    api.windows.open(WINDOW_ID);
  }

  function register(): void {
    api.registerWindow({
      id: WINDOW_ID,
      title: "Share",
      component: createShareWindow({ api, sharer, saver, bluesky, mastodon, pixelfed, pinned }),
      maximizable: true,
    });
    api.registerGridMenuItem({
      id: MENU_ID,
      label: (ids) => (ids.length > 1 ? `Share ${ids.length} photos…` : "Share…"),
      onClick: (ids) => open(ids),
    });
    api.registerTopBarButton({ id: TOP_BAR_ID, label: "Share", svg: SHARE_ICON, onClick: () => open(null) });
  }

  async function restore(): Promise<void> {
    await Promise.all([bluesky.restore(), mastodon.restore(), pixelfed.restore()]);
  }

  return { api, bluesky, mastodon, pixelfed, saver, sharer, pinned, open, register, restore };
}

export type SocialExport = ReturnType<typeof createSocialExport>;
