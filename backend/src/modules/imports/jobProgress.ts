import { IMPORT_COLLECTION_DELAY_MS } from "../../config";
import { logger } from "../../lib/logger";
import { mapWithConcurrency, sleep } from "../../lib/concurrency";
import { HttpError } from "../../http/errors";
import { createLog } from "../system/index";
import { addPrintsToCollection, findOrCreateCollectionByName } from "../library/index";
import { updateJob } from "./jobService";
import { importPrintFromUrl } from "./importPrint";
import type { ImportRequestBody } from "./types";

// Sequential on purpose: parallel bursts of api.bambulab.com calls trip MakerWorld's CAPTCHA.
const COLLECTION_IMPORT_CONCURRENCY = 1;

// Why a design failed, so a batch reads as one clear cause instead of "N failed". Once a CAPTCHA
// ("rateLimited") or auth failure hits, every remaining item fails the same way.
export type ImportFailureReason = "unavailable" | "rateLimited" | "auth" | "other";

export function classifyImportFailure(err: unknown): ImportFailureReason {
  if (err instanceof HttpError) {
    if (err.status === 403 || err.status === 404) return "unavailable";
    if (err.status === 429) return "rateLimited";
    if (err.status === 401) return "auth";
  }
  return "other";
}

export async function markJobFailed(jobId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : "Import failed";
  logger.error(`Import job ${jobId} failed`, { error: err });
  await updateJob(jobId, { status: "ERROR", errorMessage: message }).catch(() => undefined);
}

/** Outcome counters of a batch, from which the job record and the notification are written. */
export type BatchTally = {
  imported: number;
  alreadyInLibrary: number;
  processed: number;
  unavailable: number;
  rateLimited: number;
  authFailed: number;
  /** Ids of the items that failed. */
  failed: string[];
  successPrintIds: string[];
};

/**
 * Imports `ids` one by one, writing progress to the job after each. A failing item is counted by cause
 * and never stops the batch. `pauseBetween` spaces items out for providers that rate-limit bursts.
 */
export async function importBatchItems(
  jobId: string,
  userId: string,
  ids: string[],
  itemFor: (id: string) => { url: string; body: ImportRequestBody },
  pauseBetween: boolean,
): Promise<BatchTally> {
  const tally: BatchTally = {
    imported: 0,
    alreadyInLibrary: 0,
    processed: 0,
    unavailable: 0,
    rateLimited: 0,
    authFailed: 0,
    failed: [],
    successPrintIds: [],
  };
  await mapWithConcurrency(ids, COLLECTION_IMPORT_CONCURRENCY, async (id, index) => {
    const { url, body } = itemFor(id);
    try {
      const { print, alreadyImported } = await importPrintFromUrl(userId, url, body);
      tally.successPrintIds.push(print.id);
      if (alreadyImported) tally.alreadyInLibrary++;
      else tally.imported++;
    } catch (err) {
      tally.failed.push(id);
      const reason = classifyImportFailure(err);
      if (reason === "unavailable") tally.unavailable++;
      else if (reason === "rateLimited") tally.rateLimited++;
      else if (reason === "auth") tally.authFailed++;
    } finally {
      tally.processed++;
      // A progress-write failure mustn't fail the whole batch.
      await updateJob(jobId, {
        processed: tally.processed,
        imported: tally.imported,
        alreadyInLibrary: tally.alreadyInLibrary,
        failedCount: tally.failed.length,
      }).catch(() => undefined);
    }
    if (pauseBetween && index < ids.length - 1) await sleep(IMPORT_COLLECTION_DELAY_MS);
  });
  return tally;
}

/** Puts the imported prints into a collection named after the source collection; returns its id. */
export async function fileIntoCollection(userId: string, title: string, printIds: string[]): Promise<string> {
  const collection = await findOrCreateCollectionByName(userId, title);
  await addPrintsToCollection(collection.id, printIds);
  return collection.id;
}

/** Marks a collection-style batch done and records it in the audit log. */
export async function completeBatchJob(
  jobId: string,
  userId: string,
  provider: string,
  tally: BatchTally,
  result: { collectionTitle: string | null; collectionId: string | null },
): Promise<void> {
  await updateJob(jobId, {
    status: "DONE",
    sourceLabel: result.collectionTitle,
    resultCollectionId: result.collectionId,
    resultPrintId: tally.successPrintIds.length === 1 ? tally.successPrintIds[0] : null,
    processed: tally.processed,
    imported: tally.imported,
    alreadyInLibrary: tally.alreadyInLibrary,
    failedCount: tally.failed.length,
  });
  void createLog({
    userId,
    action: "import_completed",
    targetId: result.collectionId,
    details: {
      provider,
      sourceLabel: result.collectionTitle,
      imported: tally.imported,
      alreadyInLibrary: tally.alreadyInLibrary,
      failed: tally.failed.length,
    },
  });
}

/** "Lead — a, b, c." or just "Lead." when there is nothing to add. */
export function describeOutcome(lead: string, parts: string[]): string {
  return parts.length ? `${lead} — ${parts.join(", ")}.` : `${lead}.`;
}
