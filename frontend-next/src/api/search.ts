import { authHeaders } from "../utils/auth";
import { apiBase, assertOk } from "./client";
import type { Print } from "./prints";

export type SearchCollectionResult = {
  id: string;
  name: string;
  item_count: number;
};

export type SearchTagResult = {
  tag: string;
  count: number;
};

export type SearchResult = {
  /** Pre-ranked by the backend. */
  models: Print[];
  collections: SearchCollectionResult[];
  tags: SearchTagResult[];
};

export const searchApi = {
  search: async (q: string): Promise<SearchResult> => {
    const res = await fetch(`${apiBase()}/search?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
    assertOk(res, "Search failed");
    return res.json();
  },
};
