import { authHeaders } from "../utils/auth";
import { apiBase, assertOk } from "./client";

export type TagSortMode = "popular" | "name";

export type TagSummary = {
  name: string;
  count: number;
  bookmarked: boolean;
};

export const tagsApi = {
  listSummary: async (sort: TagSortMode = "popular"): Promise<TagSummary[]> => {
    const res = await fetch(`${apiBase()}/tags/summary?sort=${sort}`, { headers: authHeaders() });
    assertOk(res, "Failed to list tags");
    return res.json();
  },

  listBookmarked: async (): Promise<string[]> => {
    const res = await fetch(`${apiBase()}/tags/bookmarked`, { headers: authHeaders() });
    assertOk(res, "Failed to list bookmarked tags");
    return res.json();
  },

  bookmark: async (tag: string): Promise<void> => {
    const res = await fetch(`${apiBase()}/tags/${encodeURIComponent(tag)}/bookmark`, {
      method: "POST",
      headers: authHeaders(),
    });
    assertOk(res, "Failed to bookmark tag");
  },

  unbookmark: async (tag: string): Promise<void> => {
    const res = await fetch(`${apiBase()}/tags/${encodeURIComponent(tag)}/bookmark`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    assertOk(res, "Failed to remove bookmark");
  },
};
