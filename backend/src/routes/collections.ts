import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../auth";
import { HttpError } from "../utils/fileUtils";
import { normalizeTags } from "../utils/tagNormalization";
import { parseBody } from "../utils/validate";
import { asyncHandler } from "../utils/asyncHandler";
import {
  addPrintsToCollection,
  assertCollectionNameAvailable,
  isSystemCollectionId,
  listSystemCollectionOuts,
  loadSystemCollectionOut,
  normalizeCollectionName,
  systemCollectionKeyForId,
} from "../services/collectionService";
import {
  addCollectionBookmark,
  listBookmarkedCollectionIdSet,
  removeCollectionBookmark,
} from "../services/bookmarkService";
import { printOutsByIds } from "../services/printLoader";
import { relocatePrintsForToken } from "../services/printService";
import { createLog } from "../services/auditLog";
import { collectionReadWhere } from "../services/access";
import { toCollectionOut, type PrintOut, type CollectionAccessCtx } from "../dto";

const router = Router();
router.use(requireAuth);

const collectionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string()).default([]),
});

const COVER_ITEM_LIMIT = 4;

async function collectionPrintIds(collectionId: string): Promise<string[]> {
  const items = await prisma.collectionItem.findMany({ where: { collectionId }, select: { printId: true } });
  return items.map((item) => item.printId);
}

router.get(
  "/collections",
  asyncHandler(async (req, res) => {
    const [systemCollections, collections, bookmarkedIds] = await Promise.all([
      listSystemCollectionOuts(req.userId!),
      prisma.collection.findMany({
        where: collectionReadWhere(req.userId!),
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { items: true } },
          items: { orderBy: { position: "asc" }, take: COVER_ITEM_LIMIT },
          user: { select: { id: true, displayName: true } },
          shares: { select: { sharedWithUserId: true } },
        },
      }),
      listBookmarkedCollectionIdSet(req.userId!),
    ]);
    const coverPrintIds = collections.flatMap((c) => c.items.map((i) => i.printId));
    const printOuts = await printOutsByIds(req.userId!, coverPrintIds);
    res.json([
      ...systemCollections,
      ...collections.map((c) =>
        toCollectionOut(
          c,
          c._count.items,
          c.items.map((i) => printOuts.get(i.printId)).filter((p): p is PrintOut => Boolean(p)),
          bookmarkedIds.has(c.id),
          { viewerId: req.userId, shares: c.shares, owner: { id: c.user.id, display_name: c.user.displayName } },
        ),
      ),
    ]);
  }),
);

router.post(
  "/collections",
  asyncHandler(async (req, res) => {
    const body = parseBody(collectionSchema, req.body);
    await assertCollectionNameAvailable(req.userId!, body.name);
    const collection = await prisma.collection.create({
      data: {
        userId: req.userId!,
        name: body.name,
        nameNormalized: normalizeCollectionName(body.name),
        description: body.description?.trim() || null,
        tags: normalizeTags(body.tags),
      },
    });
    res.json(toCollectionOut(collection, 0, [], false));
    void createLog({
      userId: req.userId!,
      action: "collection_created",
      targetId: collection.id,
      details: { name: collection.name },
    });
  }),
);

router.get(
  "/collection/:id",
  asyncHandler(async (req, res) => {
    const systemKey = systemCollectionKeyForId(req.params.id);
    if (systemKey) {
      res.json(await loadSystemCollectionOut(req.userId!, systemKey));
      return;
    }
    const collection = await prisma.collection.findFirst({
      where: { id: req.params.id, ...collectionReadWhere(req.userId!) },
      include: {
        _count: { select: { items: true } },
        user: { select: { id: true, displayName: true } },
        shares: { select: { sharedWithUserId: true } },
      },
    });
    if (!collection) throw new HttpError(404, "Collection not found");
    const bookmarked = Boolean(
      await prisma.bookmark.findFirst({
        where: { userId: req.userId, type: "COLLECTION", collectionId: collection.id },
      }),
    );
    const access: CollectionAccessCtx = {
      viewerId: req.userId,
      shares: collection.shares,
      owner: { id: collection.user.id, display_name: collection.user.displayName },
    };
    res.json(toCollectionOut(collection, collection._count.items, [], bookmarked, access));
  }),
);

router.patch(
  "/collection/:id",
  asyncHandler(async (req, res) => {
    if (isSystemCollectionId(req.params.id)) {
      throw new HttpError(400, "This collection can't be edited");
    }
    const body = parseBody(collectionSchema, req.body);
    const collection = await prisma.collection.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!collection) throw new HttpError(404, "Collection not found");
    await assertCollectionNameAvailable(req.userId!, body.name, collection.id);
    const renamed = body.name !== collection.name;
    const updated = await prisma.collection.update({
      where: { id: collection.id },
      data: {
        name: body.name,
        nameNormalized: normalizeCollectionName(body.name),
        description: body.description?.trim() || null,
        tags: normalizeTags(body.tags),
      },
    });
    if (renamed) await relocatePrintsForToken("collection", await collectionPrintIds(updated.id));
    const [itemCount, bookmarked] = await Promise.all([
      prisma.collectionItem.count({ where: { collectionId: updated.id } }),
      prisma.bookmark.findFirst({ where: { userId: req.userId, type: "COLLECTION", collectionId: updated.id } }),
    ]);
    res.json(toCollectionOut(updated, itemCount, [], Boolean(bookmarked)));
    void createLog({
      userId: req.userId!,
      action: "collection_edited",
      targetId: updated.id,
      details: { name: updated.name },
    });
  }),
);

router.delete(
  "/collection/:id",
  asyncHandler(async (req, res) => {
    if (isSystemCollectionId(req.params.id)) {
      throw new HttpError(400, "This collection can't be deleted");
    }
    const collection = await prisma.collection.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!collection) throw new HttpError(404, "Collection not found");
    const printIds = await collectionPrintIds(collection.id);
    await prisma.collection.delete({ where: { id: collection.id } });
    await relocatePrintsForToken("collection", printIds);
    res.json({ ok: true });
    void createLog({
      userId: req.userId!,
      action: "collection_deleted",
      targetId: collection.id,
      details: { name: collection.name },
    });
  }),
);

// Real collections only: Favourites/History membership comes from Print columns.
router.delete(
  "/collection/:id/items/:printId",
  asyncHandler(async (req, res) => {
    if (isSystemCollectionId(req.params.id)) {
      throw new HttpError(400, "This collection can't be edited");
    }
    const collection = await prisma.collection.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!collection) throw new HttpError(404, "Collection not found");
    const print = await prisma.print.findFirst({ where: { id: req.params.printId, userId: req.userId } });
    if (!print) throw new HttpError(404, "Print not found");
    await prisma.collectionItem.deleteMany({ where: { collectionId: collection.id, printId: print.id } });
    await relocatePrintsForToken("collection", [print.id]);
    res.json({ ok: true });
    void createLog({
      userId: req.userId!,
      action: "collection_item_removed",
      targetId: collection.id,
      details: { printId: print.id, name: print.name },
    });
  }),
);

router.post(
  "/collection/:id/items/:printId",
  asyncHandler(async (req, res) => {
    if (isSystemCollectionId(req.params.id)) {
      throw new HttpError(400, "This collection can't be edited");
    }
    const collection = await prisma.collection.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!collection) throw new HttpError(404, "Collection not found");
    const print = await prisma.print.findFirst({ where: { id: req.params.printId, userId: req.userId } });
    if (!print) throw new HttpError(404, "Print not found");
    await addPrintsToCollection(collection.id, [print.id]);
    res.json({ ok: true });
    void createLog({
      userId: req.userId!,
      action: "collection_item_added",
      targetId: collection.id,
      details: { printId: print.id, name: print.name },
    });
  }),
);

router.post(
  "/collection/:id/bookmark",
  asyncHandler(async (req, res) => {
    if (isSystemCollectionId(req.params.id)) {
      throw new HttpError(400, "This collection can't be bookmarked");
    }
    const collection = await prisma.collection.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!collection) throw new HttpError(404, "Collection not found");
    await addCollectionBookmark(req.userId!, collection.id);
    res.json({ ok: true });
  }),
);

router.delete(
  "/collection/:id/bookmark",
  asyncHandler(async (req, res) => {
    if (isSystemCollectionId(req.params.id)) {
      throw new HttpError(400, "This collection can't be bookmarked");
    }
    const collection = await prisma.collection.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!collection) throw new HttpError(404, "Collection not found");
    await removeCollectionBookmark(req.userId!, collection.id);
    res.json({ ok: true });
  }),
);

// Real collections only, flagged with whether `printId` is a member.
router.get(
  "/print/:id/collections",
  asyncHandler(async (req, res) => {
    const print = await prisma.print.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!print) throw new HttpError(404, "Print not found");
    const collections = await prisma.collection.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      include: { items: { where: { printId: print.id }, select: { id: true } } },
    });
    res.json(collections.map((c) => ({ id: c.id, name: c.name, in_collection: c.items.length > 0 })));
  }),
);

// --- Targeted sharing (owner-only). Note: a model inside a shared collection stays governed by its
// own PrintShare, so sharing a collection does not expose its private models. ------------------------

async function assertOwnedCollection(collectionId: string, userId: string) {
  if (isSystemCollectionId(collectionId)) throw new HttpError(400, "This collection can't be shared");
  const collection = await prisma.collection.findFirst({ where: { id: collectionId, userId } });
  if (!collection) throw new HttpError(404, "Collection not found");
  return collection;
}

router.get(
  "/collection/:id/shares",
  asyncHandler(async (req, res) => {
    await assertOwnedCollection(req.params.id, req.userId!);
    const shares = await prisma.collectionShare.findMany({
      where: { collectionId: req.params.id },
      include: { sharedWithUser: { select: { id: true, displayName: true, email: true } } },
    });
    res.json(
      shares.map((s) => ({ user_id: s.sharedWithUserId, display_name: s.sharedWithUser.displayName, email: s.sharedWithUser.email })),
    );
  }),
);

const setSharesSchema = z.object({ user_ids: z.array(z.string()).default([]) });
router.put(
  "/collection/:id/shares",
  asyncHandler(async (req, res) => {
    await assertOwnedCollection(req.params.id, req.userId!);
    const body = parseBody(setSharesSchema, req.body);
    const targetIds = [...new Set(body.user_ids)].filter((id) => id !== req.userId);
    if (targetIds.length) {
      const count = await prisma.user.count({ where: { id: { in: targetIds } } });
      if (count !== targetIds.length) throw new HttpError(400, "Share list contains an unknown user");
    }
    await prisma.$transaction([
      prisma.collectionShare.deleteMany({
        where: { collectionId: req.params.id, ...(targetIds.length ? { sharedWithUserId: { notIn: targetIds } } : {}) },
      }),
      ...targetIds.map((uid) =>
        prisma.collectionShare.upsert({
          where: { collectionId_sharedWithUserId: { collectionId: req.params.id, sharedWithUserId: uid } },
          create: { collectionId: req.params.id, sharedWithUserId: uid },
          update: {},
        }),
      ),
    ]);
    void createLog({ userId: req.userId!, action: "collection_shared", targetId: req.params.id, details: { count: targetIds.length } });
    res.json({ ok: true });
  }),
);

export default router;
