import { describe, expect, it } from "vitest";
import type { Collection } from "@/api/collections";
import { collectionsWithTag, orderCollections } from "./order";

const make = (id: string, extra: Partial<Collection> = {}): Collection => ({
  id,
  name: id,
  description: null,
  tags: [],
  item_count: 0,
  cover_items: [],
  created_at: "2026-01-01T00:00:00Z",
  system_key: null,
  bookmarked: false,
  ...extra,
});

describe("orderCollections", () => {
  it("puts Favorites then Browsing History first and keeps the rest in server order", () => {
    const sorted = orderCollections([
      make("b"),
      make("history", { system_key: "history" }),
      make("a"),
      make("favorites", { system_key: "favorites" }),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["favorites", "history", "b", "a"]);
  });
});

describe("collectionsWithTag", () => {
  it("matches tags case-insensitively", () => {
    const items = [make("a", { tags: ["Storage"] }), make("b", { tags: ["tools"] })];
    expect(collectionsWithTag(items, "storage").map((c) => c.id)).toEqual(["a"]);
  });
});
