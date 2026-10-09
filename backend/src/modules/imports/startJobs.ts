import { HttpError } from "../../http/errors";
import { normalizeImportUrl } from "../../lib/url";
import { parseMakerworldModelUrl } from "./providers/makerworld/urls";
import { parsePrintablesCollectionUrl } from "./providers/printables";
import { parseThingiverseCollectionUrl, parseThingiverseLikesUrl } from "./providers/thingiverse";
import { withStoredMakerworldCookie } from "./cookies";
import { runCollectionImportJob } from "./makerworldCollectionJob";
import { runMakerworldProfilesImportJob } from "./makerworldProfilesJob";
import { runPrintablesCollectionImportJob } from "./printablesCollectionJob";
import { assertNoActiveJob, createJob } from "./jobService";
import type { z } from "zod";
import type {
  collectionImportSchema,
  makerworldProfilesImportSchema,
  printablesCollectionImportSchema,
  thingiverseThingsImportSchema,
  zipImportSchema,
} from "./schemas";
import { runThingiverseCollectionImportJob, runThingiverseLikesImportJob } from "./thingiverseJobs";
import { runZipImportJob } from "./zipImportJob";

// Each start* checks the request, records a RUNNING job (the per-user lock) and runs it in the background.
// The caller answers 202 with the job id; progress is polled via the job endpoints.

export async function startMakerworldProfilesImport(
  userId: string,
  input: z.output<typeof makerworldProfilesImportSchema>,
): Promise<{ job_id: string }> {
  const body = await withStoredMakerworldCookie(userId, input);
  await assertNoActiveJob(userId);
  const url = await normalizeImportUrl(body.url);
  if (!parseMakerworldModelUrl(url)) throw new HttpError(400, "Not a MakerWorld model link");
  const job = await createJob(userId, "PROFILES", { sourceUrl: url, provider: "makerworld" });
  void runMakerworldProfilesImportJob(job.id, userId, { ...body, url });
  return { job_id: job.id };
}

export async function startMakerworldCollectionImport(
  userId: string,
  input: z.output<typeof collectionImportSchema>,
): Promise<{ job_id: string }> {
  const body = await withStoredMakerworldCookie(userId, input);
  await assertNoActiveJob(userId);
  const url = await normalizeImportUrl(body.url);
  const job = await createJob(userId, "COLLECTION", {
    sourceUrl: url,
    provider: "makerworld",
    total: body.design_ids.length,
  });
  void runCollectionImportJob(job.id, userId, { ...body, url });
  return { job_id: job.id };
}

export async function startThingiverseLikesImport(
  userId: string,
  body: z.output<typeof thingiverseThingsImportSchema>,
): Promise<{ job_id: string }> {
  await assertNoActiveJob(userId);
  const url = await normalizeImportUrl(body.url);
  const parsed = parseThingiverseLikesUrl(url);
  if (!parsed) throw new HttpError(400, "Not a Thingiverse Likes URL");
  const job = await createJob(userId, "COLLECTION", {
    sourceUrl: url,
    provider: "thingiverse",
    total: body.thing_ids.length,
  });
  void runThingiverseLikesImportJob(job.id, userId, { ...body, url, username: parsed.username });
  return { job_id: job.id };
}

export async function startThingiverseCollectionImport(
  userId: string,
  body: z.output<typeof thingiverseThingsImportSchema>,
): Promise<{ job_id: string }> {
  await assertNoActiveJob(userId);
  const url = await normalizeImportUrl(body.url);
  const parsed = parseThingiverseCollectionUrl(url);
  if (!parsed) throw new HttpError(400, "Not a Thingiverse Collection URL");
  const job = await createJob(userId, "COLLECTION", {
    sourceUrl: url,
    provider: "thingiverse",
    total: body.thing_ids.length,
  });
  void runThingiverseCollectionImportJob(job.id, userId, { ...body, url, collectionId: parsed.collectionId });
  return { job_id: job.id };
}

export async function startPrintablesCollectionImport(
  userId: string,
  body: z.output<typeof printablesCollectionImportSchema>,
): Promise<{ job_id: string }> {
  await assertNoActiveJob(userId);
  const url = await normalizeImportUrl(body.url);
  const parsed = parsePrintablesCollectionUrl(url);
  if (!parsed) throw new HttpError(400, "Not a Printables Collection URL");
  const job = await createJob(userId, "COLLECTION", {
    sourceUrl: url,
    provider: "printables",
    total: body.model_ids.length,
  });
  void runPrintablesCollectionImportJob(job.id, userId, { ...body, url, collectionId: parsed.collectionId });
  return { job_id: job.id };
}

export async function startZipImport(
  userId: string,
  body: z.output<typeof zipImportSchema>,
): Promise<{ job_id: string }> {
  await assertNoActiveJob(userId);
  const url = await normalizeImportUrl(body.url);
  const job = await createJob(userId, "ZIP", { sourceUrl: url, total: body.entries.length });
  void runZipImportJob(job.id, userId, { ...body, url });
  return { job_id: job.id };
}
