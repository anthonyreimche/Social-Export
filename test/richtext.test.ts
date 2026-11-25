import { describe, expect, it } from "vitest";
import { blueskyFacets, graphemeCount } from "../src/richtext";

const bytes = (s: string) => new TextEncoder().encode(s).length;

describe("blueskyFacets", () => {
  it("marks links and hashtags at UTF-8 byte offsets", () => {
    const text = "Café light 🌅 #sunset at https://example.com/a?b=1.";
    const facets = blueskyFacets(text);
    const tagStart = bytes("Café light 🌅 ");
    const linkStart = bytes("Café light 🌅 #sunset at ");
    expect(facets).toEqual([
      {
        index: { byteStart: tagStart, byteEnd: tagStart + bytes("#sunset") },
        features: [{ $type: "app.bsky.richtext.facet#tag", tag: "sunset" }],
      },
      {
        index: { byteStart: linkStart, byteEnd: linkStart + bytes("https://example.com/a?b=1") },
        features: [{ $type: "app.bsky.richtext.facet#link", uri: "https://example.com/a?b=1" }],
      },
    ]);
  });

  it("leaves out numbers and mid-word hashes", () => {
    expect(blueskyFacets("#1 and a#b and (#film)")).toEqual([
      {
        index: { byteStart: bytes("#1 and a#b and ("), byteEnd: bytes("#1 and a#b and (#film") },
        features: [{ $type: "app.bsky.richtext.facet#tag", tag: "film" }],
      },
    ]);
  });

  it("has none for plain text", () => {
    expect(blueskyFacets("just words")).toEqual([]);
  });
});

describe("graphemeCount", () => {
  it("counts what a person sees as one character once", () => {
    expect(graphemeCount("ab")).toBe(2);
    expect(graphemeCount("👨‍👩‍👧")).toBe(1);
    expect(graphemeCount("é")).toBe(1);
  });
});
