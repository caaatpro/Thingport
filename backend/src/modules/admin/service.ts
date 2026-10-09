import fs from "node:fs/promises";
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../db";
import { deleteAllPrintFiles } from "../prints/index";
import { deleteAllPreviewImages } from "../prints/index";
import { deletePlateFiles } from "../prints/index";
import { plateThumbPath } from "../prints/index";
import { loadFullPrint } from "../prints/index";

export type UserWithPrintCount = {
  id: string;
  email: string;
  displayName: string;
  role: "ADMIN" | "MEMBER";
  printCount: number;
  collectionCount: number;
  storageBytes: number;
  apiTokenCount: number;
  makerworldConnected: boolean;
  emailVerified: boolean;
  disabledAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
};

/** Plates plus supporting files per user, from stored sizes (as in getStorageUsage). */
async function storageBytesByUser(): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ userId: string; bytes: bigint }[]>`
    SELECT p."userId", (COALESCE(SUM(pl."size"), 0))::bigint AS bytes
    FROM "Print" p JOIN "Plate" pl ON pl."printId" = p."id"
    GROUP BY p."userId"
    UNION ALL
    SELECT p."userId", (COALESCE(SUM(f."size"), 0))::bigint AS bytes
    FROM "Print" p JOIN "PrintFile" f ON f."printId" = p."id"
    GROUP BY p."userId"
  `;
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.userId, (totals.get(row.userId) ?? 0) + Number(row.bytes));
  return totals;
}

export async function listUsersWithPrintCounts(): Promise<UserWithPrintCount[]> {
  const [users, storage] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
        makerworldCookie: true,
        emailVerified: true,
        disabledAt: true,
        lastLoginAt: true,
        _count: { select: { prints: true, collections: true, apiTokens: true } },
      },
    }),
    storageBytesByUser(),
  ]);
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    createdAt: u.createdAt,
    printCount: u._count.prints,
    collectionCount: u._count.collections,
    storageBytes: storage.get(u.id) ?? 0,
    apiTokenCount: u._count.apiTokens,
    makerworldConnected: Boolean(u.makerworldCookie),
    emailVerified: u.emailVerified,
    disabledAt: u.disabledAt,
    lastLoginAt: u.lastLoginAt,
  }));
}

/** Active (not disabled) admins other than `exceptUserId`; an instance must never run out of them. */
export async function otherActiveAdminCount(exceptUserId: string): Promise<number> {
  return prisma.user.count({ where: { role: "ADMIN", disabledAt: null, id: { not: exceptUserId } } });
}

export type AdminOverview = {
  users: { total: number; admins: number; disabled: number; active_7d: number; pending_invitations: number };
  library: { models: number; collections: number; model_bytes: number };
  processing: { queued: number; processing: number; failed: number };
  imports: { running: number; failed_24h: number };
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  const [
    total,
    admins,
    disabled,
    active7d,
    invitations,
    collections,
    usage,
    queued,
    processing,
    failed,
    running,
    failed24h,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { disabledAt: { not: null } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: weekAgo } } }),
    prisma.invitation.count({ where: { expiresAt: { gt: new Date() } } }),
    prisma.collection.count(),
    getStorageUsage(),
    prisma.plate.count({ where: { processingStatus: "QUEUED" } }),
    prisma.plate.count({ where: { processingStatus: "PROCESSING" } }),
    prisma.plate.count({ where: { processingStatus: "FAILED" } }),
    prisma.importJob.count({ where: { status: "RUNNING" } }),
    prisma.importJob.count({ where: { status: "ERROR", createdAt: { gte: dayAgo } } }),
  ]);
  return {
    users: { total, admins, disabled, active_7d: active7d, pending_invitations: invitations },
    library: { models: usage.modelCount, collections, model_bytes: usage.modelBytes },
    processing: { queued, processing, failed },
    imports: { running, failed_24h: failed24h },
  };
}

export type LogEntry = {
  id: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  action: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: Date;
};

const LOG_LIST_LIMIT = 500;

/** Inclusive date bounds; without them, the latest LOG_LIST_LIMIT entries. */
export async function listLogs(filter: { userId?: string; from?: Date; to?: Date }): Promise<LogEntry[]> {
  const where: Prisma.LogWhereInput = {};
  if (filter.userId) where.userId = filter.userId;
  if (filter.from || filter.to) {
    where.createdAt = {};
    if (filter.from) where.createdAt.gte = filter.from;
    if (filter.to) where.createdAt.lte = filter.to;
  }
  const logs = await prisma.log.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: LOG_LIST_LIMIT,
    include: { user: { select: { displayName: true, email: true } } },
  });
  return logs.map((l) => ({
    id: l.id,
    userId: l.userId,
    userDisplayName: l.user.displayName,
    userEmail: l.user.email,
    action: l.action,
    targetId: l.targetId,
    details: l.details as Record<string, unknown>,
    createdAt: l.createdAt,
  }));
}

export async function deleteAllPrintsForUser(userId: string): Promise<number> {
  const prints = await prisma.print.findMany({ where: { userId }, select: { id: true } });
  for (const { id } of prints) {
    const full = await loadFullPrint(userId, id);
    await deleteAllPrintFiles(id);
    await deleteAllPreviewImages(id);
    await prisma.print.delete({ where: { id } });
    for (const plate of full.plates) {
      await deletePlateFiles(plate);
      await fs.rm(plateThumbPath(plate.id), { force: true }).catch(() => undefined);
    }
  }
  return prints.length;
}

export type StorageUsage = {
  modelBytes: number;
  modelCount: number;
};

/** Plates plus supporting and prepared files, from stored sizes (matches dto.ts's total_size). */
export async function getStorageUsage(): Promise<StorageUsage> {
  const [plates, files, modelCount] = await Promise.all([
    prisma.plate.aggregate({ _sum: { size: true } }),
    prisma.printFile.aggregate({ _sum: { size: true } }),
    prisma.print.count(),
  ]);
  return { modelBytes: (plates._sum.size ?? 0) + (files._sum.size ?? 0), modelCount };
}
