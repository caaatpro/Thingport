import { prisma } from "../../db";
import { badRequest } from "../../http/errors";
import { createLog } from "../system/index";
import type { PrintOut } from "./dto";
import { requireOwnedPrint } from "./lookup";
import { printOutById } from "./printLoader";

export type ShareOut = { user_id: string; display_name: string; email: string };

/** Targeted sharing is owner-only. */
export async function listShares(userId: string, printId: string): Promise<ShareOut[]> {
  await requireOwnedPrint(userId, printId);
  const shares = await prisma.printShare.findMany({
    where: { printId },
    include: { sharedWithUser: { select: { id: true, displayName: true, email: true } } },
  });
  return shares.map((s) => ({
    user_id: s.sharedWithUserId,
    display_name: s.sharedWithUser.displayName,
    email: s.sharedWithUser.email,
  }));
}

/** Replaces the set of people the model is shared with. */
export async function setShares(userId: string, printId: string, userIds: string[]): Promise<PrintOut> {
  await requireOwnedPrint(userId, printId);
  const targetIds = [...new Set(userIds)].filter((id) => id !== userId);
  if (targetIds.length) {
    const count = await prisma.user.count({ where: { id: { in: targetIds } } });
    if (count !== targetIds.length) throw badRequest("Share list contains an unknown user");
  }
  await prisma.$transaction([
    prisma.printShare.deleteMany({
      where: { printId, ...(targetIds.length ? { sharedWithUserId: { notIn: targetIds } } : {}) },
    }),
    ...targetIds.map((uid) =>
      prisma.printShare.upsert({
        where: { printId_sharedWithUserId: { printId, sharedWithUserId: uid } },
        create: { printId, sharedWithUserId: uid },
        update: {},
      }),
    ),
  ]);
  void createLog({ userId, action: "model_shared", targetId: printId, details: { count: targetIds.length } });
  return printOutById(userId, printId);
}
