import type { Prisma } from "../generated/prisma/client";

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
