// Social Export — a Safelight extension.
// Copyright (C) 2026 Anthony Reimche. Licensed under the GNU GPL v3 or later;
// see LICENSE.

// Post text: how long a service counts it, and Bluesky's facets, which mark
// the links and hashtags in a post by UTF-8 byte offsets.

export interface Facet {
  index: { byteStart: number; byteEnd: number };
  features: ({ $type: "app.bsky.richtext.facet#link"; uri: string } | { $type: "app.bsky.richtext.facet#tag"; tag: string })[];
}

const LINK = /https?:\/\/[^\s<>"]+/g;
const TAG = /(^|[\s(])#([^\s#.,;:!?()[\]{}"'<>]+)/gu;
const TRAILING = /[.,;:!?)\]}'"]+$/;
const MAX_TAG = 64;

const utf8 = new TextEncoder();
const byteLength = (s: string) => utf8.encode(s).length;

export function blueskyFacets(text: string): Facet[] {
  const facets: Facet[] = [];
  const add = (start: number, end: number, feature: Facet["features"][number]) =>
    facets.push({ index: { byteStart: byteLength(text.slice(0, start)), byteEnd: byteLength(text.slice(0, end)) }, features: [feature] });

  for (const m of text.matchAll(TAG)) {
    const tag = m[2];
    if (/^\d+$/.test(tag) || tag.length > MAX_TAG) continue;
    const start = m.index + m[1].length;
    add(start, start + 1 + tag.length, { $type: "app.bsky.richtext.facet#tag", tag });
  }
  for (const m of text.matchAll(LINK)) {
    const uri = m[0].replace(TRAILING, "");
    add(m.index, m.index + uri.length, { $type: "app.bsky.richtext.facet#link", uri });
  }
  return facets.sort((a, b) => a.index.byteStart - b.index.byteStart);
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Characters as a person sees them: an emoji family is one. */
export function graphemeCount(text: string): number {
  let n = 0;
  for (const _ of segmenter.segment(text)) n++;
  return n;
}
