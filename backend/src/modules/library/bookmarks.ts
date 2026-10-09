import { prisma } from "../../db";
import { badRequest } from "../../http/errors";
import { normalizeTag } from "../../lib/tags";

// The only module that touches the Bookmark table. Tags and collections share one `order`
// sequence per user.

/** New bookmarks land at the bottom. */
async function nextBookmarkOrder(userId: string): Promise<number> {
  const result = await prisma.bookmark.aggregate({ where: { userId }, _max: { order: true } });
  return (result._max.order ?? -1) + 1;
}

export async function listBookmarkedTagSet(userId: string): Promise<Set<string>> {
  const rows = await prisma.bookmark.findMany({ where: { userId, type: "TAG" }, select: { tag: true } });
  return new Set(rows.map((r) => r.tag).filter((tag): tag is string => Boolean(tag)));
}

export async function listBookmarkedCollectionIdSet(userId: string): Promise<Set<string>> {
  const rows = await prisma.bookmark.findMany({
    where: { userId, type: "COLLECTION" },
    select: { collectionId: true },
  });
  return new Set(rows.map((r) => r.collectionId).filter((id): id is string => Boolean(id)));
}

export async function isCollectionBookmarked(userId: string, collectionId: string): Promise<boolean> {
  const row = await prisma.bookmark.findFirst({ where: { userId, type: "COLLECTION", collectionId }, select: { id: true } });
  return Boolean(row);
}

/** Idempotent, so a double-click never surfaces an error. */
export async function addTagBookmark(userId: string, rawTag: string): Promise<void> {
  const tag = normalizeTag(rawTag);
  if (!tag) throw badRequest("Tag is required");
  const existing = await prisma.bookmark.findFirst({ where: { userId, type: "TAG", tag } });
  if (existing) return;
  const order = await nextBookmarkOrder(userId);
  await prisma.bookmark.create({ data: { userId, type: "TAG", tag, order } });
}

export async function removeTagBookmark(userId: string, rawTag: string): Promise<void> {
  const tag = normalizeTag(rawTag);
  await prisma.bookmark.deleteMany({ where: { userId, type: "TAG", tag } });
}

/** Idempotent. Callers must check the collection exists, is the user's, and isn't a system one. */
export async function addCollectionBookmark(userId: string, collectionId: string): Promise<void> {
  const existing = await prisma.bookmark.findFirst({ where: { userId, type: "COLLECTION", collectionId } });
  if (existing) return;
  const order = await nextBookmarkOrder(userId);
  await prisma.bookmark.create({ data: { userId, type: "COLLECTION", collectionId, order } });
}

export async function removeCollectionBookmark(userId: string, collectionId: string): Promise<void> {
  await prisma.bookmark.deleteMany({ where: { userId, type: "COLLECTION", collectionId } });
}

export type BookmarkEntryOut =
  { id: string; type: "tag"; tag: string } | { id: string; type: "collection"; collection_id: string; name: string };

/** A bookmark for a deleted collection is cascade-deleted; a tag bookmark can outlive the tag. */
export async function listBookmarks(userId: string): Promise<BookmarkEntryOut[]> {
  const rows = await prisma.bookmark.findMany({
    where: { userId },
    orderBy: { order: "asc" },
    include: { collection: { select: { id: true, name: true } } },
  });
  return rows.map((row) =>
    row.type === "TAG"
      ? { id: row.id, type: "tag" as const, tag: row.tag! }
      : { id: row.id, type: "collection" as const, collection_id: row.collection!.id, name: row.collection!.name },
  );
}

/** `orderedIds` must name exactly the user's current bookmarks. Renumbers 0..n-1. */
export async function reorderBookmarks(userId: string, orderedIds: string[]): Promise<void> {
  const bookmarks = await prisma.bookmark.findMany({ where: { userId }, select: { id: true } });
  const currentIds = new Set(bookmarks.map((b) => b.id));
  if (orderedIds.length !== bookmarks.length || !orderedIds.every((id) => currentIds.has(id))) {
    throw badRequest("bookmark_ids must contain exactly this user's current bookmarks");
  }
  await prisma.$transaction(
    orderedIds.map((id, idx) => prisma.bookmark.update({ where: { id }, data: { order: idx } })),
  );
}
