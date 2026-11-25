// Social Export — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// The destinations and what each one takes: shape, size, file size, and how
// the photos get there.

export const EXTENSION_ID = "social-export";

export const SETTINGS = {
  destination: "destination",
  fit: "fit",
  border: "border",
  visibility: "visibility",
  folder: "folder",
  bluesky: "bluesky.account",
  mastodon: "mastodon.account",
  pixelfed: "pixelfed.account",
} as const;

export type ServiceId = "bluesky" | "mastodon" | "pixelfed";

/** How the files reach the service: posted by the extension, or saved for the
 *  person to upload on the service's own site. */
export type Delivery = { kind: "post"; service: ServiceId } | { kind: "site"; url: string };

export interface Destination {
  id: string;
  label: string;
  /** The service's name, for messages ("Saved for Instagram"). */
  service: string;
  /** A fixed output width (Instagram's 1080), or else `longEdge`. */
  width?: number;
  longEdge?: number;
  /** The output's pixel count at most. */
  maxPixels?: number;
  /** Width over height, the range the service shows without cropping. */
  minAspect: number;
  maxAspect: number;
  maxBytes: number;
  delivery: Delivery;
}

const MB = 1024 * 1024;
const ANY = { minAspect: 0, maxAspect: Number.POSITIVE_INFINITY };

export const DESTINATIONS: readonly Destination[] = [
  { id: "bluesky", label: "Bluesky", service: "Bluesky", longEdge: 2000, ...ANY, maxBytes: 2_000_000, delivery: { kind: "post", service: "bluesky" } },
  {
    id: "mastodon",
    label: "Mastodon",
    service: "Mastodon",
    longEdge: 3840,
    maxPixels: 8_294_400,
    ...ANY,
    maxBytes: 16 * MB,
    delivery: { kind: "post", service: "mastodon" },
  },
  { id: "pixelfed", label: "Pixelfed", service: "Pixelfed", longEdge: 2048, ...ANY, maxBytes: 15 * MB, delivery: { kind: "post", service: "pixelfed" } },
  {
    id: "instagram",
    label: "Instagram: its own shape",
    service: "Instagram",
    width: 1080,
    minAspect: 4 / 5,
    maxAspect: 1.91,
    maxBytes: 8 * MB,
    delivery: { kind: "site", url: "https://www.instagram.com/" },
  },
  {
    id: "instagram-portrait",
    label: "Instagram: portrait 4:5",
    service: "Instagram",
    width: 1080,
    minAspect: 4 / 5,
    maxAspect: 4 / 5,
    maxBytes: 8 * MB,
    delivery: { kind: "site", url: "https://www.instagram.com/" },
  },
  {
    id: "instagram-square",
    label: "Instagram: square",
    service: "Instagram",
    width: 1080,
    minAspect: 1,
    maxAspect: 1,
    maxBytes: 8 * MB,
    delivery: { kind: "site", url: "https://www.instagram.com/" },
  },
  {
    id: "instagram-story",
    label: "Instagram: story 9:16",
    service: "Instagram",
    width: 1080,
    minAspect: 9 / 16,
    maxAspect: 9 / 16,
    maxBytes: 8 * MB,
    delivery: { kind: "site", url: "https://www.instagram.com/" },
  },
  { id: "facebook", label: "Facebook", service: "Facebook", longEdge: 2048, ...ANY, maxBytes: 8 * MB, delivery: { kind: "site", url: "https://www.facebook.com/" } },
  { id: "x", label: "X", service: "X", longEdge: 4096, ...ANY, maxBytes: 5 * MB, delivery: { kind: "site", url: "https://x.com/compose/post" } },
  { id: "threads", label: "Threads", service: "Threads", longEdge: 1440, ...ANY, maxBytes: 8 * MB, delivery: { kind: "site", url: "https://www.threads.net/" } },
];

export const DEFAULT_DESTINATION = "instagram";

export function destinationById(id: string): Destination {
  return DESTINATIONS.find((d) => d.id === id) ?? DESTINATIONS.find((d) => d.id === DEFAULT_DESTINATION)!;
}

/** What fills the frame around a photo whose shape the destination doesn't
 *  show: a border, or the photo itself, cropped from its centre. */
export type Fit = "border" | "crop";

export const BORDERS = { white: "#ffffff", black: "#000000", grey: "#808080" } as const;
export type BorderId = keyof typeof BORDERS;

/** A service's limits on a post. */
export interface PostLimits {
  maxPhotos: number;
  maxText: number;
  maxBytes: number;
  maxPixels?: number;
}

export const BLUESKY = {
  defaultProvider: "https://bsky.social",
  maxPhotos: 4,
  maxText: 300,
  appPasswords: "https://bsky.app/settings/app-passwords",
} as const;

export const MASTODON_DEFAULTS = { maxPhotos: 4, maxText: 500 } as const;
