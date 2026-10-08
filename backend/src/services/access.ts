import type { CollectionRole, Prisma } from "../generated/prisma/client";
import { prisma } from "../db";
import { HttpError } from "../utils/fileUtils";

// Read access for targeted sharing: a user may READ a resource they own OR that has been shared
// with them. Writes stay owner-only and are enforced separately (routes keep their { id, userId }
// guards). With no shares present this reduces to "owned", so existing behavior is unchanged.
//
// A model is shared with someone either directly (PrintShare) or by sitting in a collection that is
// shared with them -- the collection's current contents, including models added to it later, so
// sharing a collection never needs re-doing as it grows.

/** Models other people shared with `userId`: directly, or through a collection shared with them. */
export function sharedWithMeWhere(userId: string): Prisma.PrintWhereInput {
  return {
    OR: [
      { shares: { some: { sharedWithUserId: userId } } },
      { collectionItems: { some: { collection: { shares: { some: { sharedWithUserId: userId } } } } } },
    ],
  };
}

export function printReadWhere(userId: string): Prisma.PrintWhereInput {
  return { OR: [{ userId }, sharedWithMeWhere(userId)] };
}

export function collectionReadWhere(userId: string): Prisma.CollectionWhereInput {
  return { OR: [{ userId }, { shares: { some: { sharedWithUserId: userId } } }] };
}

/** Selection that tells the owner a model is visible to others via one of their collections. */
export const sharedViaCollectionSelect = {
  where: { collection: { shares: { some: {} } } },
  select: { id: true },
  take: 1,
} satisfies Prisma.Print$collectionItemsArgs;

// --- Collection roles ----------------------------------------------------------------------------
// A collection share carries a role, a ladder where each level includes the ones below it:
//   VIEW    see and download the collection's models
//   UPLOAD  + upload new models into it
//   EDIT    + edit the collection and its models' details and files, take models out of it
//   DELETE  + delete the models in it
// Models uploaded into someone's collection belong to the collection's owner. Sharing the collection,
// deleting it, categories and authors stay with the owner.

const ROLE_RANK: Record<CollectionRole, number> = { VIEW: 0, UPLOAD: 1, EDIT: 2, DELETE: 3 };

export function rolesAtLeast(min: CollectionRole): CollectionRole[] {
  return (Object.keys(ROLE_RANK) as CollectionRole[]).filter((role) => ROLE_RANK[role] >= ROLE_RANK[min]);
}

export function roleAtLeast(role: CollectionRole | null | undefined, min: CollectionRole): boolean {
  return role != null && ROLE_RANK[role] >= ROLE_RANK[min];
}

/** Models `userId` may change at `min`: their own, or ones in a collection shared with them at that level. */
export function printWriteWhere(userId: string, min: CollectionRole): Prisma.PrintWhereInput {
  return {
    OR: [
      { userId },
      {
        collectionItems: {
          some: {
            collection: { shares: { some: { sharedWithUserId: userId, role: { in: rolesAtLeast(min) } } } },
          },
        },
      },
    ],
  };
}

export type CollectionAccess = {
  collection: { id: string; userId: string; name: string };
  isOwner: boolean;
  /** Null for the owner, who can do everything. */
  role: CollectionRole | null;
};

/** Loads a collection the user can read, with what they may do in it. Throws 404 when they cannot read it. */
export async function loadCollectionAccess(userId: string, collectionId: string): Promise<CollectionAccess> {
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, ...collectionReadWhere(userId) },
    select: {
      id: true,
      userId: true,
      name: true,
      shares: { where: { sharedWithUserId: userId }, select: { role: true } },
    },
  });
  if (!collection) throw new HttpError(404, "Collection not found");
  const isOwner = collection.userId === userId;
  return {
    collection: { id: collection.id, userId: collection.userId, name: collection.name },
    isOwner,
    role: isOwner ? null : (collection.shares[0]?.role ?? "VIEW"),
  };
}

/** Like loadCollectionAccess, but 403 unless the user is the owner or holds at least `min`. */
export async function requireCollectionRole(
  userId: string,
  collectionId: string,
  min: CollectionRole,
): Promise<CollectionAccess> {
  const access = await loadCollectionAccess(userId, collectionId);
  if (!access.isOwner && !roleAtLeast(access.role, min)) {
    throw new HttpError(403, "You don't have permission to do that in this collection");
  }
  return access;
}

/** The strongest role `userId` holds on each model through collections shared with them (owned models omitted). */
export async function viewerRolesByPrint(userId: string, printIds: string[]): Promise<Map<string, CollectionRole>> {
  const out = new Map<string, CollectionRole>();
  if (!printIds.length) return out;
  const items = await prisma.collectionItem.findMany({
    where: {
      printId: { in: printIds },
      print: { userId: { not: userId } },
      collection: { shares: { some: { sharedWithUserId: userId } } },
    },
    select: {
      printId: true,
      collection: { select: { shares: { where: { sharedWithUserId: userId }, select: { role: true } } } },
    },
  });
  for (const item of items) {
    const role = item.collection.shares[0]?.role;
    if (!role) continue;
    const current = out.get(item.printId);
    if (!current || ROLE_RANK[role] > ROLE_RANK[current]) out.set(item.printId, role);
  }
  return out;
}
