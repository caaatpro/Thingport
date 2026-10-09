import { authHeaders } from "../utils/auth";
import { apiBase, assertOk } from "./client";

/** Tags and collections share one list, sorted by the user's manual order. */
export type BookmarkEntry =
  { id: string; type: "tag"; tag: string } | { id: string; type: "collection"; collection_id: string; name: string };

export const bookmarksApi = {
  list: async (): Promise<BookmarkEntry[]> => {
    const res = await fetch(`${apiBase()}/bookmarks`, { headers: authHeaders() });
    assertOk(res, "Failed to list bookmarks");
    return res.json();
  },

  /** `ids` must be exactly the user's current bookmark ids, in their new order. */
  reorder: async (ids: string[]): Promise<BookmarkEntry[]> => {
    const res = await fetch(`${apiBase()}/bookmarks/reorder`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ bookmark_ids: ids }),
    });
    assertOk(res, "Failed to reorder bookmarks");
    return res.json();
  },
};
