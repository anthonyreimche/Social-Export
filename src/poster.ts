// Social Export — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// What every service the extension posts to offers the Share window.

import type { PostLimits, ServiceId } from "./config";
import type { AppStore } from "./safelight";
import type { AccountState } from "./vault";

export interface PostImage {
  blob: Blob;
  width: number;
  height: number;
  alt: string;
}

export type Visibility = "public" | "unlisted" | "private";

export interface PostOptions {
  text: string;
  visibility?: Visibility;
  /** A content warning; its text hides the post behind it. */
  warning?: string;
  sensitive?: boolean;
  signal?: AbortSignal;
}

export type AccountStore = AppStore<AccountState>;

export interface Poster {
  id: ServiceId;
  store: AccountStore;
  /** Take up a sign-in kept from an earlier launch. */
  restore(): Promise<void>;
  signOut(): Promise<void>;
  /** What a post may hold, as the service (or its instance) says. */
  limits(): Promise<PostLimits>;
  /** Upload the images and post them; resolves with the post's address. */
  post(images: PostImage[], options: PostOptions): Promise<{ url: string | null }>;
}
