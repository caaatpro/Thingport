import type { PrintSortMode } from "@/api/prints";
import type { PrintScope } from "@/features/prints";

export type LibraryParams = { category: string | null; sort: PrintSortMode; scope: PrintScope };

/** Reads the shareable library state from the URL. The old `orderBy` name still works for existing links. */
export function readLibraryParams(search: URLSearchParams): LibraryParams {
  const sortRaw = search.get("sort") ?? search.get("orderBy");
  const scopeRaw = search.get("scope");
  return {
    category: search.get("category") || null,
    sort: sortRaw === "popular" || sortRaw === "downloads" ? sortRaw : "newest",
    scope: scopeRaw === "shared" || scopeRaw === "all" ? scopeRaw : "mine",
  };
}

/**
 * Applies a change to the URL, leaving every other param alone. Defaults (newest, mine, no category) are
 * dropped so the plain `/models` stays clean. The legacy `orderBy` is always replaced by `sort`.
 */
export function withLibraryParams(search: URLSearchParams, change: Partial<LibraryParams>): URLSearchParams {
  const next = new URLSearchParams(search);
  const current = readLibraryParams(search);
  const merged = { ...current, ...change };
  next.delete("orderBy");
  const put = (key: string, value: string | null) => (value ? next.set(key, value) : next.delete(key));
  put("category", merged.category);
  put("sort", merged.sort === "newest" ? null : merged.sort);
  put("scope", merged.scope === "mine" ? null : merged.scope);
  return next;
}

/** The link for a category (or "All" with null) that keeps sort, scope and any other params. */
export function categoryHref(search: URLSearchParams, category: string | null): string {
  const query = withLibraryParams(search, { category }).toString();
  return query ? `/models?${query}` : "/models";
}
