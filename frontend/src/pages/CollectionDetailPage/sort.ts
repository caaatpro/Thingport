import type { PrintSortMode } from "@/api/prints";

/** The sort order from `?orderBy=`; anything unknown means "newest". */
export function parseSort(value: string | null): PrintSortMode {
  return value === "popular" || value === "downloads" ? value : "newest";
}

/** A copy of the params with `orderBy` set (and dropped for the default). */
export function withSort(params: URLSearchParams, mode: PrintSortMode): URLSearchParams {
  const next = new URLSearchParams(params);
  if (mode === "newest") next.delete("orderBy");
  else next.set("orderBy", mode);
  return next;
}
