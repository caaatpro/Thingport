import { createNotification } from "../system/index";
import { fetchPrintablesCollectionTitle } from "./providers/printables";
import { completeBatchJob, describeOutcome, fileIntoCollection, importBatchItems, markJobFailed } from "./jobProgress";
import type { ImportRequestBody } from "./types";

export type PrintablesCollectionImportJobBody = ImportRequestBody & { model_ids: string[]; collectionId: string };

export async function runPrintablesCollectionImportJob(
  jobId: string,
  userId: string,
  body: PrintablesCollectionImportJobBody,
): Promise<void> {
  try {
    const tally = await importBatchItems(
      jobId,
      userId,
      body.model_ids,
      (modelId) => {
        const url = `https://www.printables.com/model/${modelId}`;
        return {
          url,
          body: { url, notes: body.notes ?? null, tags: body.tags ?? [], category_id: body.category_id ?? null },
        };
      },
      true,
    );

    const collectionTitle =
      (await fetchPrintablesCollectionTitle(body.collectionId)) ?? `Printables Collection ${body.collectionId}`;
    const resultCollectionId = tally.successPrintIds.length
      ? await fileIntoCollection(userId, collectionTitle, tally.successPrintIds)
      : null;

    await completeBatchJob(jobId, userId, "printables", tally, { collectionTitle, collectionId: resultCollectionId });

    // A rejected request (401) isn't singled out for Printables: it counts as a plain failure.
    const parts: string[] = [];
    if (tally.alreadyInLibrary) parts.push(`${tally.alreadyInLibrary} already in your library`);
    const otherFailed = tally.failed.length - tally.unavailable - tally.rateLimited;
    if (tally.unavailable) parts.push(`${tally.unavailable} unavailable (private, deleted, or removed)`);
    if (tally.rateLimited) parts.push(`${tally.rateLimited} rate-limited by Printables — wait a while, then retry`);
    if (otherFailed) parts.push(`${otherFailed} failed`);
    await createNotification(userId, {
      title: `Imported ${tally.imported} of ${body.model_ids.length} models from Printables`,
      body: describeOutcome(`From "${collectionTitle}"`, parts),
      externalUrl: body.url,
      internalPath: resultCollectionId ? `/models/collections/${resultCollectionId}` : null,
    });
  } catch (err) {
    await markJobFailed(jobId, err);
  }
}
