import { prisma } from "../../db";
import { normalizeTag } from "../../lib/tags";
import { listBookmarkedTagSet } from "./bookmarks";

export type TagSummarySort = "popular" | "name";

const byName = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());

/**
 * Every tag in the library with its model count (unlike GET /tags, which follows the grid filter).
 * Counting stays in JS: tags are normalised and sorted with the same JS rules the UI relies on, which
 * SQL's upper/lower/collation would not reproduce exactly.
 */
export async function tagSummary(userId: string, sort: TagSummarySort) {
  const [prints, bookmarked] = await Promise.all([
    prisma.print.findMany({ where: { userId }, select: { tags: true } }),
    listBookmarkedTagSet(userId),
  ]);
  const counts = new Map<string, number>();
  for (const print of prints) {
    for (const tag of print.tags) {
      const cleaned = normalizeTag(tag);
      if (!cleaned) continue;
      counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, bookmarked: bookmarked.has(name) }))
    .toSorted((a, b) => (sort === "name" ? byName(a.name, b.name) : b.count - a.count || byName(a.name, b.name)));
}

/** Just the bookmarked names, without scanning every print like `tagSummary`. */
export async function bookmarkedTagNames(userId: string): Promise<string[]> {
  return [...(await listBookmarkedTagSet(userId))].toSorted(byName);
}
