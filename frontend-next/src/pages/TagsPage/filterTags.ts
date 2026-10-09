import type { TagSummary } from "@/api/tags";

/** Narrows the tag list by a name fragment and, optionally, drops tags used only once. */
export function filterTags(tags: TagSummary[], query: string, hideRarelyUsed: boolean): TagSummary[] {
  const needle = query.trim().toLowerCase();
  return tags.filter((t) => (!hideRarelyUsed || t.count >= 2) && (!needle || t.name.toLowerCase().includes(needle)));
}
