import { IMPORT_MAKERWORLD_CALL_DELAY_MS } from "../../config";
import { createNotification } from "../system/index";
import { extractMakerworldBearerToken } from "./providers/makerworld/urls";
import { fetchMakerworldCollectionTitle } from "./providers/makerworld/collections";
import { parseMakerworldCollectionUrl } from "./providers/makerworld/urls";
import { resolveMakerworldCookie } from "./cookies";
import { completeBatchJob, describeOutcome, fileIntoCollection, importBatchItems, markJobFailed } from "./jobProgress";
import type { ImportRequestBody } from "./types";

export type CollectionImportJobBody = ImportRequestBody & { design_ids: string[] };

export async function runCollectionImportJob(
  jobId: string,
  userId: string,
  body: CollectionImportJobBody,
): Promise<void> {
  try {
    const tally = await importBatchItems(
      jobId,
      userId,
      body.design_ids,
      (designId) => {
        const url = `https://makerworld.com/en/models/${designId}`;
        return {
          url,
          body: {
            url,
            notes: body.notes ?? null,
            tags: body.tags ?? [],
            category_id: body.category_id ?? null,
            makerworld_cookie: body.makerworld_cookie,
            makerworldPaceMs: IMPORT_MAKERWORLD_CALL_DELAY_MS,
          },
        };
      },
      false,
    );

    let resultCollectionId: string | null = null;
    let collectionTitle: string | null = null;
    if (tally.successPrintIds.length) {
      const parsed = parseMakerworldCollectionUrl(body.url);
      if (parsed) {
        const bearerToken = extractMakerworldBearerToken(resolveMakerworldCookie(body));
        collectionTitle = await fetchMakerworldCollectionTitle(
          parsed.collectionId,
          bearerToken,
          IMPORT_MAKERWORLD_CALL_DELAY_MS,
        );
        if (collectionTitle)
          resultCollectionId = await fileIntoCollection(userId, collectionTitle, tally.successPrintIds);
      }
    }

    await completeBatchJob(jobId, userId, "makerworld", tally, { collectionTitle, collectionId: resultCollectionId });

    const parts: string[] = [];
    if (tally.alreadyInLibrary) parts.push(`${tally.alreadyInLibrary} already in your library`);
    const otherFailed = tally.failed.length - tally.unavailable - tally.rateLimited - tally.authFailed;
    if (tally.unavailable) parts.push(`${tally.unavailable} unavailable (private, deleted, or hidden)`);
    if (tally.rateLimited) {
      parts.push(
        `${tally.rateLimited} blocked by a MakerWorld CAPTCHA challenge (too many requests at once) — this usually clears in 1-4 hours, then retry the same collection`,
      );
    }
    if (tally.authFailed) {
      parts.push(
        `${tally.authFailed} failed because your MakerWorld session expired — update the cookie in Settings and retry`,
      );
    }
    if (otherFailed) parts.push(`${otherFailed} failed`);
    await createNotification(userId, {
      title: `Imported ${tally.imported} of ${body.design_ids.length} models from MakerWorld`,
      body: describeOutcome(`From ${collectionTitle ? `"${collectionTitle}"` : "a MakerWorld collection"}`, parts),
      externalUrl: body.url,
      internalPath: resultCollectionId ? `/models/collections/${resultCollectionId}` : null,
    });
  } catch (err) {
    await markJobFailed(jobId, err);
  }
}
