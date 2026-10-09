import type { Router } from "express";
import { createRouter } from "../../http/route";
import { notFound } from "../../http/errors";
import { normalizeImportUrl } from "../../lib/url";
import { createLog } from "../system/index";
import { toPrintOut } from "../prints/index";
import { withStoredMakerworldCookie } from "./cookies";
import { toImportJobOut } from "./dto";
import { checkImportStatus } from "./importedPrints";
import { importPrintFromUrl } from "./importPrint";
import { inspectImportLink, listZipImportEntries } from "./inspect";
import { getActiveJob, getJob } from "./jobService";
import {
  listMakerworldCollection,
  listPrintablesCollection,
  listThingiverseCollection,
  listThingiverseLikes,
} from "./listings";
import {
  collectionImportSchema,
  importRequestSchema,
  importStatusQuery,
  makerworldProfilesImportSchema,
  printablesCollectionImportSchema,
  thingiverseThingsImportSchema,
  zipImportSchema,
} from "./schemas";
import {
  startMakerworldCollectionImport,
  startMakerworldProfilesImport,
  startPrintablesCollectionImport,
  startThingiverseCollectionImport,
  startThingiverseLikesImport,
  startZipImport,
} from "./startJobs";

const api = createRouter();

api.post("/import", { body: importRequestSchema }, async ({ userId, body: input }) => {
  const body = await withStoredMakerworldCookie(userId, input);
  const url = await normalizeImportUrl(body.url);
  const result = await importPrintFromUrl(userId, url, body);
  const { print, plates, author, previewImages } = result;
  const importOutcome = result.alreadyImported ? "already_imported" : result.profileAdded ? "profile_added" : "created";
  void createLog({ userId, action: "model_imported", targetId: print.id, details: { name: print.name, url } });
  return { ...toPrintOut(print, plates, [], null, author, previewImages), import_outcome: importOutcome };
});

api.post("/import/inspect", { body: importRequestSchema }, async ({ userId, body: input }) => {
  const body = await withStoredMakerworldCookie(userId, input);
  return inspectImportLink(await normalizeImportUrl(body.url), body);
});

// Never fetches the URL, so it skips the SSRF check. Called by the extension on every page load.
api.get("/import/status", { query: importStatusQuery }, ({ userId, query }) => checkImportStatus(userId, query.url));

api.post("/import/zip/entries", { body: importRequestSchema }, async ({ userId, body: input }) => {
  const body = await withStoredMakerworldCookie(userId, input);
  return listZipImportEntries(await normalizeImportUrl(body.url), body);
});

api.post("/import/collection/entries", { body: importRequestSchema }, ({ userId, body }) =>
  listMakerworldCollection(userId, body),
);
api.post("/import/thingiverse-likes/entries", { body: importRequestSchema }, ({ userId, body }) =>
  listThingiverseLikes(userId, body),
);
api.post("/import/thingiverse-collection/entries", { body: importRequestSchema }, ({ userId, body }) =>
  listThingiverseCollection(userId, body),
);
api.post("/import/printables-collection/entries", { body: importRequestSchema }, ({ userId, body }) =>
  listPrintablesCollection(userId, body),
);

// Batch imports answer 202 with the job to poll.
api.post("/import/makerworld-profiles", { body: makerworldProfilesImportSchema }, async ({ res, userId, body }) => {
  const started = await startMakerworldProfilesImport(userId, body);
  res.status(202);
  return started;
});
api.post("/import/collection", { body: collectionImportSchema }, async ({ res, userId, body }) => {
  const started = await startMakerworldCollectionImport(userId, body);
  res.status(202);
  return started;
});
api.post("/import/thingiverse-likes", { body: thingiverseThingsImportSchema }, async ({ res, userId, body }) => {
  const started = await startThingiverseLikesImport(userId, body);
  res.status(202);
  return started;
});
api.post("/import/thingiverse-collection", { body: thingiverseThingsImportSchema }, async ({ res, userId, body }) => {
  const started = await startThingiverseCollectionImport(userId, body);
  res.status(202);
  return started;
});
api.post("/import/printables-collection", { body: printablesCollectionImportSchema }, async ({ res, userId, body }) => {
  const started = await startPrintablesCollectionImport(userId, body);
  res.status(202);
  return started;
});
api.post("/import/zip", { body: zipImportSchema }, async ({ res, userId, body }) => {
  const started = await startZipImport(userId, body);
  res.status(202);
  return started;
});

api.get("/import/jobs/active", async ({ userId }) => {
  const job = await getActiveJob(userId);
  return job ? toImportJobOut(job) : null;
});

api.get("/import/jobs/:id", async ({ userId, params }) => {
  const job = await getJob(params.id, userId);
  if (!job) throw notFound("Import job not found");
  return toImportJobOut(job);
});

export const routers: Router[] = [api.router];
