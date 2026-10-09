import fs from "node:fs/promises";
import fsSync from "node:fs";
import { logger } from "../../../lib/logger";
import { getSimplifyPreviews } from "../../../services/settingsService";
import {
  legacyModelPreviewErrorPath,
  legacyModelPreviewGlbPath,
  modelPreviewErrorPath,
  modelPreviewGlbExists,
  modelPreviewGlbPath,
  modelPreviewPendingPath,
} from "./cachePaths";
import { renderInWorker } from "./renderInWorker";
import { SIMPLIFY_TARGET_TRIANGLES } from "./simplification";

const ERROR_RETRY_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
// Failures that would just repeat (too complex, killed for limits) are never retried
// automatically. Delete the .error file to force a retry.
const PERMANENT_FAILURE_PREFIX = "permanent: ";
const UNSUPPORTED_MARKER = `${PERMANENT_FAILURE_PREFIX}unsupported`;

function recentlyFailed(plateId: string): boolean {
  const errorPath = modelPreviewErrorPath(plateId);
  try {
    const stat = fsSync.statSync(errorPath);
    if (Date.now() - stat.mtimeMs < ERROR_RETRY_COOLDOWN_MS) return true;
    return fsSync.readFileSync(errorPath, "utf-8").startsWith(PERMANENT_FAILURE_PREFIX);
  } catch {
    return false;
  }
}

const inFlight = new Set<string>();
const crashWarned = new Set<string>();

// One render at a time: parallel renders would multiply peak memory past the limit.
let queue: Promise<void> = Promise.resolve();

/** Never throws. Concurrent calls for the same plate no-op. */
export async function generateModelPreviewGlb(plateId: string, srcPath: string): Promise<void> {
  if (modelPreviewGlbExists(plateId) || inFlight.has(plateId) || recentlyFailed(plateId)) return;
  if (fsSync.existsSync(modelPreviewPendingPath(plateId))) {
    if (!crashWarned.has(plateId)) {
      crashWarned.add(plateId);
      logger.warn(
        `Model preview for plate ${plateId} was interrupted by a previous crash; not retrying. ` +
          `Delete ${modelPreviewPendingPath(plateId)} to allow another attempt.`,
      );
    }
    return;
  }
  inFlight.add(plateId);
  const run = queue.then(() => runGeneration(plateId, srcPath));
  queue = run;
  await run;
}

/** "failed" won't retry soon; "unsupported" is left to the browser's loaders. */
type ModelPreviewState = "ready" | "generating" | "failed" | "unsupported";

export function modelPreviewState(plateId: string): ModelPreviewState {
  if (modelPreviewGlbExists(plateId)) return "ready";
  if (inFlight.has(plateId)) return "generating";
  if (recentlyFailed(plateId)) {
    try {
      return fsSync.readFileSync(modelPreviewErrorPath(plateId), "utf-8") === UNSUPPORTED_MARKER
        ? "unsupported"
        : "failed";
    } catch {
      return "failed";
    }
  }
  if (fsSync.existsSync(modelPreviewPendingPath(plateId))) return "failed";
  return "generating";
}

async function runGeneration(plateId: string, srcPath: string): Promise<void> {
  const pendingPath = modelPreviewPendingPath(plateId);
  const errorPath = modelPreviewErrorPath(plateId);
  const dest = modelPreviewGlbPath(plateId);
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(pendingPath, new Date().toISOString());
    const simplify = await getSimplifyPreviews();
    const outcome = await renderInWorker({
      srcPath,
      destPath: tmp,
      options: { simplifyTo: simplify ? SIMPLIFY_TARGET_TRIANGLES : null },
    });
    switch (outcome.status) {
      case "ok":
        await fs.rename(tmp, dest);
        await fs.rm(errorPath, { force: true });
        await fs.rm(legacyModelPreviewGlbPath(plateId), { force: true });
        await fs.rm(legacyModelPreviewErrorPath(plateId), { force: true });
        break;
      case "too-complex":
        await fs.writeFile(errorPath, `${PERMANENT_FAILURE_PREFIX}too-complex`);
        break;
      case "unsupported":
        await fs.writeFile(errorPath, UNSUPPORTED_MARKER);
        break;
      case "limit":
        logger.warn(`Model preview for plate ${plateId} stopped: ${outcome.reason}`);
        await fs.writeFile(errorPath, `${PERMANENT_FAILURE_PREFIX}${outcome.reason}`);
        break;
      case "error":
        logger.error(`Model preview generation failed for plate ${plateId}`, { error: outcome.error });
        await fs.writeFile(errorPath, outcome.error);
        break;
    }
  } catch (err) {
    logger.error(`Model preview generation failed for plate ${plateId}`, { error: err });
    await fs.writeFile(errorPath, String(err)).catch(() => undefined);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    await fs.rm(pendingPath, { force: true }).catch(() => undefined);
    inFlight.delete(plateId);
  }
}
