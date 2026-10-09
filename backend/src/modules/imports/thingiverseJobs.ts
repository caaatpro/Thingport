import { createNotification } from "../system/index";
import { fetchThingiverseCollectionTitle } from "./providers/thingiverse";
import { completeBatchJob, describeOutcome, fileIntoCollection, importBatchItems, markJobFailed } from "./jobProgress";
import { requireThingiverseAccessToken } from "./thingiverseImport";
import type { ImportRequestBody } from "./types";

export type ThingiverseLikesImportJobBody = ImportRequestBody & { thing_ids: string[]; username: string };
export type ThingiverseCollectionImportJobBody = ImportRequestBody & { thing_ids: string[]; collectionId: string };

/** Shared by the Thingiverse Likes and Collection imports. Successful imports are filed into the
 * collection named by `resolveCollectionTitle`, which runs afterwards so it costs no API call
 * when nothing was imported. */
async function runThingiverseThingsImportJob(
  jobId: string,
  userId: string,
  body: ImportRequestBody & { thing_ids: string[] },
  resolveCollectionTitle: (accessToken: string) => Promise<string>,
  sourceLabel: (collectionTitle: string) => string,
): Promise<void> {
  try {
    const accessToken = await requireThingiverseAccessToken();

    const tally = await importBatchItems(
      jobId,
      userId,
      body.thing_ids,
      (thingId) => {
        const url = `https://www.thingiverse.com/thing:${thingId}`;
        return {
          url,
          body: { url, notes: body.notes ?? null, tags: body.tags ?? [], category_id: body.category_id ?? null },
        };
      },
      true,
    );

    const collectionTitle = await resolveCollectionTitle(accessToken);
    const resultCollectionId = tally.successPrintIds.length
      ? await fileIntoCollection(userId, collectionTitle, tally.successPrintIds)
      : null;

    await completeBatchJob(jobId, userId, "thingiverse", tally, { collectionTitle, collectionId: resultCollectionId });

    const parts: string[] = [];
    if (tally.alreadyInLibrary) parts.push(`${tally.alreadyInLibrary} already in your library`);
    const otherFailed = tally.failed.length - tally.unavailable - tally.rateLimited - tally.authFailed;
    if (tally.unavailable) parts.push(`${tally.unavailable} unavailable (private, deleted, or hidden)`);
    if (tally.rateLimited) {
      parts.push(
        `${tally.rateLimited} blocked by Thingiverse's rate-limit protection (too many requests at once) — wait a while, then retry`,
      );
    }
    if (tally.authFailed) parts.push(`${tally.authFailed} failed because the configured Access Token was rejected`);
    if (otherFailed) parts.push(`${otherFailed} failed`);
    await createNotification(userId, {
      title: `Imported ${tally.imported} of ${body.thing_ids.length} models from Thingiverse`,
      body: describeOutcome(`From ${sourceLabel(collectionTitle)}`, parts),
      externalUrl: body.url,
      internalPath: resultCollectionId ? `/models/collections/${resultCollectionId}` : null,
    });
  } catch (err) {
    await markJobFailed(jobId, err);
  }
}

export async function runThingiverseLikesImportJob(
  jobId: string,
  userId: string,
  body: ThingiverseLikesImportJobBody,
): Promise<void> {
  await runThingiverseThingsImportJob(
    jobId,
    userId,
    body,
    async () => "Thingiverse Likes",
    () => `@${body.username}'s Likes`,
  );
}

export async function runThingiverseCollectionImportJob(
  jobId: string,
  userId: string,
  body: ThingiverseCollectionImportJobBody,
): Promise<void> {
  await runThingiverseThingsImportJob(
    jobId,
    userId,
    body,
    async (accessToken) =>
      (await fetchThingiverseCollectionTitle(body.collectionId, accessToken)) ??
      `Thingiverse Collection ${body.collectionId}`,
    (collectionTitle) => `"${collectionTitle}"`,
  );
}
