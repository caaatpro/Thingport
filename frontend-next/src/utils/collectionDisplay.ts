import type { Collection } from "../api/collections";

/** Favourites and Browsing History are built in; their server-side `name` is only a fallback. */
export function collectionDisplayName(collection: Collection): string {
  if (collection.system_key === "favorites") return "Favorites";
  if (collection.system_key === "history") return "Browsing history";
  return collection.name;
}
