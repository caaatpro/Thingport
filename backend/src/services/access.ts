import type { Prisma } from "@prisma/client";

// Read access for targeted sharing: a user may READ a resource they own OR that has been shared
// with them. Writes stay owner-only and are enforced separately (routes keep their { id, userId }
// guards). With no shares present this reduces to "owned", so existing behavior is unchanged.

export function printReadWhere(userId: string): Prisma.PrintWhereInput {
  return { OR: [{ userId }, { shares: { some: { sharedWithUserId: userId } } }] };
}

export function collectionReadWhere(userId: string): Prisma.CollectionWhereInput {
  return { OR: [{ userId }, { shares: { some: { sharedWithUserId: userId } } }] };
}
