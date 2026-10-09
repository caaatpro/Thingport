import type { Collection } from "@/api/collections";

const SYSTEM_ORDER = ["favorites", "history"];

const rank = (c: Collection) => (c.system_key ? SYSTEM_ORDER.indexOf(c.system_key) : SYSTEM_ORDER.length);

/** Built-in collections (Favorites, Browsing History) first, everything else in the server's order. */
export function orderCollections(collections: Collection[]): Collection[] {
  return collections.toSorted((a, b) => rank(a) - rank(b));
}

/** Collections carrying the tag (the server can't filter these), matched case-insensitively. */
export function collectionsWithTag<T extends { tags: string[] }>(collections: T[], tag: string): T[] {
  const wanted = tag.toLowerCase();
  return collections.filter((c) => c.tags.some((t) => t.toLowerCase() === wanted));
}
