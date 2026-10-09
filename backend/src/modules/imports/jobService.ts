import { prisma } from "../../db";
import type { ImportJob, ImportJobType, Prisma } from "../../generated/prisma/client";
import { HttpError } from "../../http/errors";

// Batch imports run in the background and are polled via GET /import/jobs/:id. One RUNNING job
// per user doubles as the "already in progress" lock.

export async function getActiveJob(userId: string): Promise<ImportJob | null> {
  return prisma.importJob.findFirst({ where: { userId, status: "RUNNING" } });
}

export async function getJob(id: string, userId: string): Promise<ImportJob | null> {
  return prisma.importJob.findFirst({ where: { id, userId } });
}

export async function assertNoActiveJob(userId: string): Promise<void> {
  const active = await getActiveJob(userId);
  if (active) throw new HttpError(409, "An import is already in progress");
}

export async function createJob(
  userId: string,
  type: ImportJobType,
  data: { sourceUrl: string; sourceLabel?: string | null; provider?: string | null; total?: number },
): Promise<ImportJob> {
  return prisma.importJob.create({
    data: {
      userId,
      type,
      sourceUrl: data.sourceUrl,
      sourceLabel: data.sourceLabel ?? null,
      provider: data.provider ?? null,
      total: data.total ?? 0,
    },
  });
}

export async function updateJob(id: string, data: Prisma.ImportJobUpdateInput): Promise<void> {
  await prisma.importJob.update({ where: { id }, data });
}
