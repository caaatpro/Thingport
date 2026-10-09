import fs from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { MODEL_PREVIEW_MAX_MEMORY_MB, NORMALIZE_3MF_TIMEOUT_SECONDS, NORMALIZED_3MFS } from "../../../config";
import { logger } from "../../../lib/logger";
import { workerBootstrap } from "../../../lib/workerBootstrap";
import type { Normalize3mfWorkerInput, Normalize3mfWorkerResult } from "./workerProtocol";

// Part of the cache filename, so bumping it rebuilds older copies on next request.
const NORMALIZE_FORMAT_VERSION = 1;

const WORKER_BOOTSTRAP = workerBootstrap(__dirname, "normalizeWorker");

function normalizedPath(plateId: string): string {
  return path.join(NORMALIZED_3MFS, `${plateId}.v${NORMALIZE_FORMAT_VERSION}.3mf`);
}

// Marks a source the normalizer rejected, so each request doesn't redo the work to fail again.
function errorPath(plateId: string): string {
  return path.join(NORMALIZED_3MFS, `${plateId}.v${NORMALIZE_FORMAT_VERSION}.error`);
}

/** Sliced .gcode.3mf plates are left alone: dropping their G-code would leave nothing to print. */
export function isNormalizable3mf(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith(".3mf") && !lower.endsWith(".gcode.3mf");
}

async function isFresh(file: string, srcMtimeMs: number): Promise<boolean> {
  try {
    return (await fs.stat(file)).mtimeMs >= srcMtimeMs;
  } catch {
    return false;
  }
}

function normalizeInWorker(input: Normalize3mfWorkerInput): Promise<Normalize3mfWorkerResult> {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER_BOOTSTRAP, {
      eval: true,
      workerData: input,
      resourceLimits: { maxOldGenerationSizeMb: MODEL_PREVIEW_MAX_MEMORY_MB },
    });
    let settled = false;
    const finish = (result: Normalize3mfWorkerResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate().then(
        () => resolve(result),
        () => resolve(result),
      );
    };
    const timeout = setTimeout(
      () => finish({ status: "error", error: `took longer than ${NORMALIZE_3MF_TIMEOUT_SECONDS}s` }),
      NORMALIZE_3MF_TIMEOUT_SECONDS * 1000,
    );
    worker.once("message", finish);
    worker.once("error", (err) => finish({ status: "error", error: err.stack ?? String(err) }));
    worker.once("exit", (code) => finish({ status: "error", error: `worker exited (code ${code}) without a result` }));
  });
}

async function buildNormalized(plateId: string, srcPath: string): Promise<string | null> {
  const dest = normalizedPath(plateId);
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  await fs.mkdir(NORMALIZED_3MFS, { recursive: true });
  try {
    const result = await normalizeInWorker({ srcPath, destPath: tmp });
    if (result.status === "ok") {
      await fs.rename(tmp, dest);
      await fs.rm(errorPath(plateId), { force: true });
      return dest;
    }
    logger.warn(`Normalizing 3MF for plate ${plateId} failed; serving the original`, { error: result.error });
    await fs.writeFile(errorPath(plateId), result.error);
    return null;
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
  }
}

const inFlight = new Map<string, Promise<string | null>>();
// One at a time: a large 3MF is held in memory several times over while it's rewritten.
let queue: Promise<unknown> = Promise.resolve();

// A failure is retried after this, so a timeout on a busy server doesn't block the plate for good.
const ERROR_RETRY_MS = 60 * 60 * 1000;

async function recentlyFailed(plateId: string, srcMtimeMs: number): Promise<boolean> {
  try {
    const { mtimeMs } = await fs.stat(errorPath(plateId));
    return mtimeMs >= srcMtimeMs && Date.now() - mtimeMs < ERROR_RETRY_MS;
  } catch {
    return false;
  }
}

function startJob(plateId: string, srcPath: string): Promise<string | null> {
  let pending = inFlight.get(plateId);
  if (!pending) {
    pending = queue.then(() => buildNormalized(plateId, srcPath));
    queue = pending.catch(() => undefined);
    inFlight.set(plateId, pending);
    void pending.finally(() => inFlight.delete(plateId)).catch(() => undefined);
  }
  return pending;
}

type Normalize3mfStatus = "ready" | "preparing" | "failed";

/** Starts a normalize in the background when there's no usable copy yet. Never throws. */
export async function normalize3mfStatus(plateId: string, srcPath: string): Promise<Normalize3mfStatus> {
  try {
    const { mtimeMs } = await fs.stat(srcPath);
    if (await isFresh(normalizedPath(plateId), mtimeMs)) return "ready";
    if (inFlight.has(plateId)) return "preparing";
    if (await recentlyFailed(plateId, mtimeMs)) return "failed";
    void startJob(plateId, srcPath).catch(() => undefined);
    return "preparing";
  } catch (err) {
    logger.error(`Normalizing 3MF for plate ${plateId} failed`, { error: err });
    return "failed";
  }
}

/** Path to a slicer-compatible copy of the plate's 3MF, waiting for one if needed, or null to serve
 *  the original. Never throws. */
export async function normalized3mfFor(plateId: string, srcPath: string): Promise<string | null> {
  try {
    const { mtimeMs } = await fs.stat(srcPath);
    if (await isFresh(normalizedPath(plateId), mtimeMs)) return normalizedPath(plateId);
    if (!inFlight.has(plateId) && (await recentlyFailed(plateId, mtimeMs))) return null;
    return await startJob(plateId, srcPath);
  } catch (err) {
    logger.error(`Normalizing 3MF for plate ${plateId} failed`, { error: err });
    return null;
  }
}

export async function deleteNormalized3mf(plateId: string): Promise<void> {
  await fs.rm(normalizedPath(plateId), { force: true }).catch(() => undefined);
  await fs.rm(errorPath(plateId), { force: true }).catch(() => undefined);
}
