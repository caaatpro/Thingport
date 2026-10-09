import type { Collection, CollectionRole, Prisma } from "../../generated/prisma/client";
import { prisma } from "../../db";
import { badRequest, conflict, notFound } from "../../http/errors";
import { normalizeTags } from "../../lib/tags";
import { collectionReadWhere, requireCollectionRole } from "../prints/index";
import { createLog } from "../system/index";
import { printOutsByIds } from "../prints/index";
import { relocatePrintsForToken } from "../prints/index";
import {
  toCollectionOut,
  toSystemCollectionOut,
  type CollectionAccessCtx,
  type CollectionOut,
  type SystemCollectionKey,
} from "./dto";
import type { PrintOut } from "../prints/dto";
import {
  addCollectionBookmark,
  isCollectionBookmarked,
  listBookmarkedCollectionIdSet,
  removeCollectionBookmark,
} from "./bookmarks";
import type { SHARE_ROLES } from "./schemas";

export function normalizeCollectionName(name: string): string {
  return name.trim().toLowerCase();
}

/** Checked first so the reserved-name message wins over "already exists". */
function assertCollectionNameNotReserved(name: string): void {
  const normalized = normalizeCollectionName(name);
  const reserved = Object.values(SYSTEM_COLLECTIONS).find((c) => normalizeCollectionName(c.name) === normalized);
  if (reserved) throw conflict(`"${reserved.name}" is reserved for the built-in collection`);
}

/** So a raw Prisma unique-constraint error never reaches the client. */
export async function assertCollectionNameAvailable(userId: string, name: string, excludeId?: string): Promise<void> {
  assertCollectionNameNotReserved(name);
  const existing = await prisma.collection.findFirst({
    where: {
      userId,
      nameNormalized: normalizeCollectionName(name),
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (existing) throw conflict(`A collection named "${name.trim()}" already exists`);
}

/** Case-insensitive, so re-importing a collection reuses the same row. */
export async function findOrCreateCollectionByName(userId: string, name: string): Promise<Collection> {
  const trimmed = name.trim();
  const nameNormalized = normalizeCollectionName(trimmed);
  const existing = await prisma.collection.findFirst({ where: { userId, nameNormalized } });
  if (existing) return existing;
  return prisma.collection.create({ data: { userId, name: trimmed, nameNormalized } });
}

/** Skips prints already present, then moves files if the storage template has a {collection}
 * folder. */
export async function addPrintsToCollection(collectionId: string, printIds: string[]): Promise<void> {
  if (!printIds.length) return;
  const last = await prisma.collectionItem.findFirst({
    where: { collectionId },
    orderBy: { position: "desc" },
  });
  let nextPosition = (last?.position ?? -1) + 1;
  await prisma.collectionItem.createMany({
    data: printIds.map((printId) => ({ collectionId, printId, position: nextPosition++ })),
    skipDuplicates: true,
  });
  await relocatePrintsForToken("collection", printIds);
}

// Favourites and History aren't real rows: they're derived from Print.favoritedAt/lastViewedAt.
// Their ids are reserved.

const SYSTEM_COLLECTION_COVER_LIMIT = 4;

type SystemCollectionMeta = { id: string; name: string; field: "favoritedAt" | "lastViewedAt" };

export const SYSTEM_COLLECTIONS: Record<SystemCollectionKey, SystemCollectionMeta> = {
  favorites: { id: "favorites", name: "Favourites", field: "favoritedAt" },
  history: { id: "history", name: "Browsing History", field: "lastViewedAt" },
};

const SYSTEM_COLLECTION_IDS = new Map<string, SystemCollectionKey>(
  (Object.keys(SYSTEM_COLLECTIONS) as SystemCollectionKey[]).map((key) => [SYSTEM_COLLECTIONS[key].id, key]),
);

export function systemCollectionKeyForId(id: string): SystemCollectionKey | null {
  return SYSTEM_COLLECTION_IDS.get(id) ?? null;
}

export function isSystemCollectionId(id: string): boolean {
  return SYSTEM_COLLECTION_IDS.has(id);
}

function systemCollectionWhere(userId: string, field: "favoritedAt" | "lastViewedAt"): Prisma.PrintWhereInput {
  return field === "favoritedAt" ? { userId, favoritedAt: { not: null } } : { userId, lastViewedAt: { not: null } };
}

function systemCollectionOrderBy(field: "favoritedAt" | "lastViewedAt"): Prisma.PrintOrderByWithRelationInput {
  return field === "favoritedAt" ? { favoritedAt: "desc" } : { lastViewedAt: "desc" };
}

export async function loadSystemCollectionOut(userId: string, key: SystemCollectionKey): Promise<CollectionOut> {
  const meta = SYSTEM_COLLECTIONS[key];
  const where = systemCollectionWhere(userId, meta.field);
  const [itemCount, coverRows] = await Promise.all([
    prisma.print.count({ where }),
    prisma.print.findMany({
      where,
      orderBy: systemCollectionOrderBy(meta.field),
      take: SYSTEM_COLLECTION_COVER_LIMIT,
      select: { id: true },
    }),
  ]);
  const coverIds = coverRows.map((r) => r.id);
  const printOuts = await printOutsByIds(userId, coverIds);
  const coverPrints = coverIds.map((id) => printOuts.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  return toSystemCollectionOut(meta.id, key, meta.name, itemCount, coverPrints);
}

export async function listSystemCollectionOuts(userId: string): Promise<CollectionOut[]> {
  return Promise.all(
    (Object.keys(SYSTEM_COLLECTIONS) as SystemCollectionKey[]).map((key) => loadSystemCollectionOut(userId, key)),
  );
}

const COVER_ITEM_LIMIT = 4;

export type CollectionInput = { name: string; description?: string | null; tags: string[] };

const SHARE_WITH_OWNER = { select: { id: true, displayName: true } } as const;
const SHARE_ROWS = { select: { sharedWithUserId: true, role: true } } as const;

async function collectionPrintIds(collectionId: string): Promise<string[]> {
  const items = await prisma.collectionItem.findMany({ where: { collectionId }, select: { printId: true } });
  return items.map((item) => item.printId);
}

/** The pseudo collections first, then every collection the user owns or that was shared with them. */
export async function listCollections(userId: string): Promise<CollectionOut[]> {
  const [systemCollections, collections, bookmarkedIds] = await Promise.all([
    listSystemCollectionOuts(userId),
    prisma.collection.findMany({
      where: collectionReadWhere(userId),
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { items: true } },
        items: { orderBy: { position: "asc" }, take: COVER_ITEM_LIMIT },
        user: SHARE_WITH_OWNER,
        shares: SHARE_ROWS,
      },
    }),
    listBookmarkedCollectionIdSet(userId),
  ]);
  const printOuts = await printOutsByIds(
    userId,
    collections.flatMap((c) => c.items.map((i) => i.printId)),
  );
  return [
    ...systemCollections,
    ...collections.map((c) =>
      toCollectionOut(
        c,
        c._count.items,
        c.items.map((i) => printOuts.get(i.printId)).filter((p): p is PrintOut => Boolean(p)),
        bookmarkedIds.has(c.id),
        { viewerId: userId, shares: c.shares, owner: { id: c.user.id, display_name: c.user.displayName } },
      ),
    ),
  ];
}

export async function getCollection(userId: string, id: string): Promise<CollectionOut> {
  const systemKey = systemCollectionKeyForId(id);
  if (systemKey) return loadSystemCollectionOut(userId, systemKey);
  const collection = await prisma.collection.findFirst({
    where: { id, ...collectionReadWhere(userId) },
    include: { _count: { select: { items: true } }, user: SHARE_WITH_OWNER, shares: SHARE_ROWS },
  });
  if (!collection) throw notFound("Collection not found");
  const access: CollectionAccessCtx = {
    viewerId: userId,
    shares: collection.shares,
    owner: { id: collection.user.id, display_name: collection.user.displayName },
  };
  return toCollectionOut(
    collection,
    collection._count.items,
    [],
    await isCollectionBookmarked(userId, collection.id),
    access,
  );
}

export async function createCollection(userId: string, input: CollectionInput): Promise<CollectionOut> {
  await assertCollectionNameAvailable(userId, input.name);
  const collection = await prisma.collection.create({
    data: {
      userId,
      name: input.name,
      nameNormalized: normalizeCollectionName(input.name),
      description: input.description?.trim() || null,
      tags: normalizeTags(input.tags),
    },
  });
  void createLog({ userId, action: "collection_created", targetId: collection.id, details: { name: collection.name } });
  return toCollectionOut(collection, 0, [], false);
}

/**
 * Owner, or a share with at least the EDIT role. `parseInput` validates the request body once the
 * built-in collections are ruled out, so their error wins over a malformed body.
 */
export async function updateCollection(
  userId: string,
  id: string,
  parseInput: () => CollectionInput,
): Promise<CollectionOut> {
  if (isSystemCollectionId(id)) throw badRequest("This collection can't be edited");
  const input = parseInput();
  const access = await requireCollectionRole(userId, id, "EDIT");
  const collection = await prisma.collection.findUniqueOrThrow({ where: { id: access.collection.id } });
  await assertCollectionNameAvailable(collection.userId, input.name, collection.id);
  const updated = await prisma.collection.update({
    where: { id: collection.id },
    data: {
      name: input.name,
      nameNormalized: normalizeCollectionName(input.name),
      description: input.description?.trim() || null,
      tags: normalizeTags(input.tags),
    },
  });
  if (input.name !== collection.name) await relocatePrintsForToken("collection", await collectionPrintIds(updated.id));
  const [itemCount, bookmarked] = await Promise.all([
    prisma.collectionItem.count({ where: { collectionId: updated.id } }),
    isCollectionBookmarked(userId, updated.id),
  ]);
  void createLog({ userId, action: "collection_edited", targetId: updated.id, details: { name: updated.name } });
  return toCollectionOut(updated, itemCount, [], bookmarked, {
    viewerId: userId,
    shares: access.isOwner ? [] : [{ sharedWithUserId: userId, role: access.role ?? "VIEW" }],
  });
}

export async function deleteCollection(userId: string, id: string): Promise<void> {
  if (isSystemCollectionId(id)) throw badRequest("This collection can't be deleted");
  const collection = await requireOwnedCollection(userId, id);
  const printIds = await collectionPrintIds(collection.id);
  await prisma.collection.delete({ where: { id: collection.id } });
  await relocatePrintsForToken("collection", printIds);
  void createLog({ userId, action: "collection_deleted", targetId: collection.id, details: { name: collection.name } });
}

async function requireOwnedCollection(userId: string, id: string): Promise<Collection> {
  const collection = await prisma.collection.findFirst({ where: { id, userId } });
  if (!collection) throw notFound("Collection not found");
  return collection;
}

/** Real collections only: Favourites/History membership comes from Print columns. */
export async function removePrintFromCollection(userId: string, id: string, printId: string): Promise<void> {
  if (isSystemCollectionId(id)) throw badRequest("This collection can't be edited");
  const { collection } = await requireCollectionRole(userId, id, "EDIT");
  const print = await prisma.print.findFirst({
    where: { id: printId, collectionItems: { some: { collectionId: collection.id } } },
    select: { id: true, name: true },
  });
  if (!print) throw notFound("Print not found");
  await prisma.collectionItem.deleteMany({ where: { collectionId: collection.id, printId: print.id } });
  await relocatePrintsForToken("collection", [print.id]);
  void createLog({
    userId,
    action: "collection_item_removed",
    targetId: collection.id,
    details: { printId: print.id, name: print.name },
  });
}

/** Owner only, and only the owner's own models. */
export async function addPrintToCollection(userId: string, id: string, printId: string): Promise<void> {
  if (isSystemCollectionId(id)) throw badRequest("This collection can't be edited");
  const collection = await requireOwnedCollection(userId, id);
  const print = await prisma.print.findFirst({ where: { id: printId, userId }, select: { id: true, name: true } });
  if (!print) throw notFound("Print not found");
  await addPrintsToCollection(collection.id, [print.id]);
  void createLog({
    userId,
    action: "collection_item_added",
    targetId: collection.id,
    details: { printId: print.id, name: print.name },
  });
}

/** A collection the user may read, for bookmarking; system collections can't be bookmarked. */
async function requireBookmarkableCollection(userId: string, id: string): Promise<Collection> {
  if (isSystemCollectionId(id)) throw badRequest("This collection can't be bookmarked");
  const collection = await prisma.collection.findFirst({ where: { id, ...collectionReadWhere(userId) } });
  if (!collection) throw notFound("Collection not found");
  return collection;
}

export async function bookmarkCollection(userId: string, id: string): Promise<void> {
  await addCollectionBookmark(userId, (await requireBookmarkableCollection(userId, id)).id);
}

export async function unbookmarkCollection(userId: string, id: string): Promise<void> {
  await removeCollectionBookmark(userId, (await requireBookmarkableCollection(userId, id)).id);
}

/** The user's own collections, flagged with whether `printId` is a member. */
export async function listCollectionsForPrint(userId: string, printId: string) {
  const print = await prisma.print.findFirst({ where: { id: printId, userId }, select: { id: true } });
  if (!print) throw notFound("Print not found");
  const collections = await prisma.collection.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, items: { where: { printId: print.id }, select: { id: true } } },
  });
  return collections.map((c) => ({ id: c.id, name: c.name, in_collection: c.items.length > 0 }));
}

// --- Targeted sharing (owner-only). A model inside a shared collection stays governed by its own
// PrintShare, so sharing a collection does not expose its private models. ----------------------------

async function requireShareableCollection(userId: string, id: string): Promise<Collection> {
  if (isSystemCollectionId(id)) throw badRequest("This collection can't be shared");
  return requireOwnedCollection(userId, id);
}

export async function listCollectionShares(userId: string, id: string) {
  await requireShareableCollection(userId, id);
  const shares = await prisma.collectionShare.findMany({
    where: { collectionId: id },
    include: { sharedWithUser: { select: { id: true, displayName: true, email: true } } },
  });
  return shares.map((s) => ({
    user_id: s.sharedWithUserId,
    display_name: s.sharedWithUser.displayName,
    email: s.sharedWithUser.email,
    role: s.role.toLowerCase(),
  }));
}

export type CollectionSharesInput = { user_ids?: string[]; shares?: { user_id: string; role: string }[] };

/**
 * Replaces the share list. `parseInput` runs after the ownership check and before anything is written,
 * so an unknown collection answers 404 before a malformed list answers 400.
 */
export async function setCollectionShares(
  userId: string,
  id: string,
  parseInput: () => CollectionSharesInput,
): Promise<void> {
  await requireShareableCollection(userId, id);
  const input = parseInput();
  const wanted = new Map<string, CollectionRole>();
  for (const uid of input.user_ids ?? []) wanted.set(uid, "VIEW");
  for (const share of input.shares ?? [])
    wanted.set(share.user_id, share.role.toUpperCase() as (typeof SHARE_ROLES)[number]);
  wanted.delete(userId);
  const targetIds = [...wanted.keys()];
  if (targetIds.length) {
    const count = await prisma.user.count({ where: { id: { in: targetIds } } });
    if (count !== targetIds.length) throw badRequest("Share list contains an unknown user");
  }
  await prisma.$transaction([
    prisma.collectionShare.deleteMany({
      where: { collectionId: id, ...(targetIds.length ? { sharedWithUserId: { notIn: targetIds } } : {}) },
    }),
    ...targetIds.map((uid) =>
      prisma.collectionShare.upsert({
        where: { collectionId_sharedWithUserId: { collectionId: id, sharedWithUserId: uid } },
        create: { collectionId: id, sharedWithUserId: uid, role: wanted.get(uid) },
        update: { role: wanted.get(uid) },
      }),
    ),
  ]);
  void createLog({ userId, action: "collection_shared", targetId: id, details: { count: targetIds.length } });
}
