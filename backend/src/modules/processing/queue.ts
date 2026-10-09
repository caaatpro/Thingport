import path from "node:path";
import { prisma } from "../../db";
import { logger } from "../../lib/logger";
import { resolvePlateFilePath } from "../prints/index";
import { ensurePlateThumbnail, extractFusionThumbnail, renderPlateThumbnail, saveThumbFromFile } from "../prints/index";
import { getPreviewMode } from "../system/index";
import { generateModelPreviewGlb } from "./preview/cache";

// Durable, restart-safe post-upload processing (thumbnail / preview / geometry). Jobs are
// ProcessingJob rows; a single in-process drainer runs them one at a time (rasterizing is CPU-bound,
// so parallelism wouldn't help and would multiply memory). Unlike the fire-and-forget import jobs,
// interrupted work is re-queued on boot instead of abandoned.

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]);
const RENDERABLE_MESH_EXTS = new Set([".stl", ".obj", ".step", ".stp"]);
const MAX_ATTEMPTS = 3;

/** The actual work for one plate — best-effort; only throws on unexpected failures (which retry). */
async function processPlate(plateId: string): Promise<void> {
  const plate = await prisma.plate.findUnique({ where: { id: plateId } });
  if (!plate) return; // deleted before we got to it
  const filePath = resolvePlateFilePath(plate);
  if (!filePath) return; // nothing on disk to process
  const ext = path.extname(plate.filename).toLowerCase();

  if (plate.mime.toLowerCase().startsWith("image/") && IMAGE_EXTS.has(ext)) {
    await saveThumbFromFile(plate.id, filePath);
  } else if (ext === ".3mf") {
    await ensurePlateThumbnail(plate.id, filePath);
    if ((await getPreviewMode()) === "automatic") await generateModelPreviewGlb(plate.id, filePath);
  } else if (ext === ".f3d" || ext === ".f3z") {
    await extractFusionThumbnail(plate.id, filePath);
  } else if (RENDERABLE_MESH_EXTS.has(ext)) {
    await renderPlateThumbnail(plate.id, filePath); // renders a thumbnail and persists dimensions
  }
}

let draining = false;

async function claimNextJob(): Promise<{ id: string; plateId: string; attempts: number } | null> {
  const job = await prisma.processingJob.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" } });
  if (!job) return null;
  const claimed = await prisma.processingJob.updateMany({
    where: { id: job.id, status: "QUEUED" },
    data: { status: "RUNNING" },
  });
  if (claimed.count === 0) return claimNextJob(); // raced (shouldn't happen with one drainer)
  await prisma.plate
    .update({ where: { id: job.plateId }, data: { processingStatus: "PROCESSING" } })
    .catch(() => undefined);
  return { id: job.id, plateId: job.plateId, attempts: job.attempts };
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      const job = await claimNextJob();
      if (!job) break;
      try {
        await processPlate(job.plateId);
        await prisma.processingJob.update({ where: { id: job.id }, data: { status: "DONE" } }).catch(() => undefined);
        await prisma.plate
          .update({ where: { id: job.plateId }, data: { processingStatus: "READY", processingError: null } })
          .catch(() => undefined);
      } catch (err) {
        const attempts = job.attempts + 1;
        const message = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
        if (attempts < MAX_ATTEMPTS) {
          await prisma.processingJob
            .update({ where: { id: job.id }, data: { status: "QUEUED", attempts, error: message } })
            .catch(() => undefined);
        } else {
          await prisma.processingJob
            .update({ where: { id: job.id }, data: { status: "ERROR", attempts, error: message } })
            .catch(() => undefined);
          await prisma.plate
            .update({ where: { id: job.plateId }, data: { processingStatus: "FAILED", processingError: message } })
            .catch(() => undefined);
        }
      }
    }
  } finally {
    draining = false;
  }
}

/** Queue a plate for background processing and kick the drainer. */
export async function enqueuePlate(plateId: string): Promise<void> {
  await prisma.plate.update({ where: { id: plateId }, data: { processingStatus: "QUEUED" } }).catch(() => undefined);
  await prisma.processingJob.create({ data: { plateId } });
  void drain();
}

/** On boot, re-queue anything left RUNNING (a crash mid-process) and resume the drainer. */
export async function recoverAndStart(): Promise<void> {
  await prisma.processingJob
    .updateMany({ where: { status: "RUNNING" }, data: { status: "QUEUED" } })
    .catch((err) => logger.error("Failed to recover processing jobs", { error: err }));
  await prisma.plate
    .updateMany({ where: { processingStatus: "PROCESSING" }, data: { processingStatus: "QUEUED" } })
    .catch(() => undefined);
  void drain();
}
