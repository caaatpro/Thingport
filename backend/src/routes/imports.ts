import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { HttpError } from "../utils/fileUtils";
import { normalizeImportUrl } from "../utils/urlUtils";
import { parseBody } from "../utils/validate";
import { asyncHandler } from "../utils/asyncHandler";
import {
  checkImportStatus,
  downloadImportToTemp,
  findImportedExternalIds,
  importPrintFromUrl,
  inspectImportLink,
} from "../services/importService";
import { resolveMakerworldCookie } from "../services/importResolvers";
import {
  extractMakerworldBearerToken,
  MakerworldAuthError,
  MakerworldCaptchaError,
  parseMakerworldModelUrl,
} from "../services/makerworldCloudApi";
import {
  fetchMakerworldCollectionEntries,
  fetchMakerworldCollectionTitle,
  parseMakerworldCollectionUrl,
} from "../services/makerworldCollections";
import { IMPORT_MAKERWORLD_CALL_DELAY_MS } from "../config";
import {
  fetchThingiverseCollectionThings,
  fetchThingiverseCollectionTitle,
  fetchThingiverseUserLikes,
  parseThingiverseCollectionUrl,
  parseThingiverseLikesUrl,
} from "../services/thingiverseApi";
import { fetchPrintablesCollectionEntries, parsePrintablesCollectionUrl } from "../services/printablesApi";
import { getThingiverseAccessToken } from "../services/settingsService";
import { getUserMakerworldCookie } from "../services/makerworldCookieService";
import { listZipEntries } from "../services/zipService";
import { createJob, getActiveJob, getJob } from "../services/importJobService";
import {
  runCollectionImportJob,
  runMakerworldProfilesImportJob,
  runPrintablesCollectionImportJob,
  runThingiverseCollectionImportJob,
  runThingiverseLikesImportJob,
  runZipImportJob,
} from "../services/importJobRunner";
import { createLog } from "../services/auditLog";
import { toImportJobOut, toPrintOut } from "../dto";

const router = Router();
router.use(requireAuth);

const importRequestSchema = z.object({
  url: z.string(),
  title: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  category_id: z.string().nullable().optional(),
  filename: z.string().nullable().optional(),
  makerworld_cookie: z.string().nullable().optional(),
  // Resolved by the extension in the page itself. Skips the backend's own resolution, which is
  // what trips MakerWorld's CAPTCHA.
  resolved_download_url: z.string().nullable().optional(),
  resolved_instance_id: z.string().nullable().optional(),
  makerworld_design: z.record(z.string(), z.unknown()).nullable().optional(),
  // Cults3D: title/description/image the extension read off the page.
  page_meta: z.record(z.string(), z.unknown()).nullable().optional(),
  resolved_files: z
    .array(
      z.object({
        url: z.string(),
        filename: z.string().max(255).nullable().optional(),
      }),
    )
    .max(50)
    .nullable()
    .optional(),
});

// Falls back to the cookie saved in Settings when the request doesn't carry one.
async function withStoredMakerworldCookie<T extends { makerworld_cookie?: string | null }>(
  userId: string,
  body: T,
): Promise<T> {
  if (body.makerworld_cookie && body.makerworld_cookie.trim()) return body;
  const stored = await getUserMakerworldCookie(userId);
  return stored ? { ...body, makerworld_cookie: stored } : body;
}

router.post(
  "/import",
  asyncHandler(async (req, res) => {
    const body = await withStoredMakerworldCookie(req.userId!, parseBody(importRequestSchema, req.body));
    const url = await normalizeImportUrl(body.url);
    const result = await importPrintFromUrl(req.userId!, url, body);
    const { print, plates, author, previewImages } = result;
    const importOutcome = result.alreadyImported
      ? "already_imported"
      : result.profileAdded
        ? "profile_added"
        : "created";
    res.json({
      ...toPrintOut(print, plates, [], null, author, previewImages),
      import_outcome: importOutcome,
    });
    void createLog({
      userId: req.userId!,
      action: "model_imported",
      targetId: print.id,
      details: { name: print.name, url },
    });
  }),
);

router.post(
  "/import/inspect",
  asyncHandler(async (req, res) => {
    const body = await withStoredMakerworldCookie(req.userId!, parseBody(importRequestSchema, req.body));
    const url = await normalizeImportUrl(body.url);
    const result = await inspectImportLink(url, body);
    res.json(result);
  }),
);

// Never fetches the URL, so it skips the SSRF check. Called by the extension on every page load.
router.get(
  "/import/status",
  asyncHandler(async (req, res) => {
    const url = typeof req.query.url === "string" ? req.query.url.trim() : "";
    if (!url) throw new HttpError(400, "url is required");
    res.json(await checkImportStatus(req.userId!, url));
  }),
);

router.post(
  "/import/zip/entries",
  asyncHandler(async (req, res) => {
    const body = await withStoredMakerworldCookie(req.userId!, parseBody(importRequestSchema, req.body));
    const url = await normalizeImportUrl(body.url);
    const { tempPath, filename } = await downloadImportToTemp(url, body);
    try {
      if (path.extname(filename).toLowerCase() !== ".zip") throw new HttpError(415, "Imported file is not a zip");
      const entries = await listZipEntries(tempPath);
      if (!entries.length) throw new HttpError(400, "No files found in zip");
      res.json({ filename, entries });
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
  }),
);

router.post(
  "/import/collection/entries",
  asyncHandler(async (req, res) => {
    const body = await withStoredMakerworldCookie(req.userId!, parseBody(importRequestSchema, req.body));
    const url = await normalizeImportUrl(body.url);
    const parsed = parseMakerworldCollectionUrl(url);
    if (!parsed) throw new HttpError(400, "Not a MakerWorld collection URL");
    const bearerToken = extractMakerworldBearerToken(resolveMakerworldCookie(body));

    // Sequential: fetching both at once is an unpaced burst.
    let title: string | null;
    let listing: Awaited<ReturnType<typeof fetchMakerworldCollectionEntries>>;
    try {
      title = await fetchMakerworldCollectionTitle(parsed.collectionId, bearerToken);
      listing = await fetchMakerworldCollectionEntries(
        parsed.collectionId,
        bearerToken,
        undefined,
        IMPORT_MAKERWORLD_CALL_DELAY_MS,
      );
    } catch (err) {
      if (err instanceof MakerworldCaptchaError) throw new HttpError(429, err.message);
      // 400, not 401: the frontend treats any 401 as an expired Thingport session.
      if (err instanceof MakerworldAuthError) throw new HttpError(400, err.message);
      throw err;
    }
    if (!listing.entries.length) throw new HttpError(400, "Could not load this collection's models");

    const alreadyImported = await findImportedExternalIds(
      req.userId!,
      "makerworld",
      listing.entries.map((e) => e.designId),
    );
    res.json({
      title,
      total: listing.total,
      truncated: listing.truncated,
      entries: listing.entries.map((e) => ({
        design_id: e.designId,
        title: e.title,
        cover: e.cover,
        already_imported: alreadyImported.has(e.designId),
      })),
    });
  }),
);

router.post(
  "/import/thingiverse-likes/entries",
  asyncHandler(async (req, res) => {
    const body = parseBody(importRequestSchema, req.body);
    const url = await normalizeImportUrl(body.url);
    const parsed = parseThingiverseLikesUrl(url);
    if (!parsed) throw new HttpError(400, "Not a Thingiverse Likes URL");
    const accessToken = await getThingiverseAccessToken();
    if (!accessToken) {
      throw new HttpError(
        503,
        "Thingiverse import isn't configured for this instance yet -- ask an admin to add an Access Token in Admin Settings.",
      );
    }

    const listing = await fetchThingiverseUserLikes(parsed.username, accessToken);
    if (!listing.entries.length)
      throw new HttpError(400, "Could not load this user's likes -- check the username and try again");

    const alreadyImported = await findImportedExternalIds(
      req.userId!,
      "thingiverse",
      listing.entries.map((e) => e.thingId),
    );
    res.json({
      title: `${parsed.username}'s Thingiverse Likes`,
      total: listing.entries.length,
      truncated: listing.truncated,
      entries: listing.entries.map((e) => ({
        design_id: e.thingId,
        title: e.title,
        cover: e.cover,
        already_imported: alreadyImported.has(e.thingId),
      })),
    });
  }),
);

router.post(
  "/import/thingiverse-collection/entries",
  asyncHandler(async (req, res) => {
    const body = parseBody(importRequestSchema, req.body);
    const url = await normalizeImportUrl(body.url);
    const parsed = parseThingiverseCollectionUrl(url);
    if (!parsed) throw new HttpError(400, "Not a Thingiverse Collection URL");
    const accessToken = await getThingiverseAccessToken();
    if (!accessToken) {
      throw new HttpError(
        503,
        "Thingiverse import isn't configured for this instance yet -- ask an admin to add an Access Token in Admin Settings.",
      );
    }

    const [title, listing] = await Promise.all([
      fetchThingiverseCollectionTitle(parsed.collectionId, accessToken),
      fetchThingiverseCollectionThings(parsed.collectionId, accessToken),
    ]);
    if (!listing.entries.length) throw new HttpError(400, "Could not load this collection's models");

    const alreadyImported = await findImportedExternalIds(
      req.userId!,
      "thingiverse",
      listing.entries.map((e) => e.thingId),
    );
    res.json({
      title,
      total: listing.entries.length,
      truncated: listing.truncated,
      entries: listing.entries.map((e) => ({
        design_id: e.thingId,
        title: e.title,
        cover: e.cover,
        already_imported: alreadyImported.has(e.thingId),
      })),
    });
  }),
);

router.post(
  "/import/printables-collection/entries",
  asyncHandler(async (req, res) => {
    const body = parseBody(importRequestSchema, req.body);
    const url = await normalizeImportUrl(body.url);
    const parsed = parsePrintablesCollectionUrl(url);
    if (!parsed) throw new HttpError(400, "Not a Printables Collection URL");

    const listing = await fetchPrintablesCollectionEntries(parsed.collectionId);
    if (!listing.entries.length) throw new HttpError(400, "Could not load this collection's models");

    const alreadyImported = await findImportedExternalIds(
      req.userId!,
      "printables",
      listing.entries.map((e) => e.modelId),
    );
    res.json({
      title: listing.title,
      total: listing.total,
      truncated: listing.truncated,
      entries: listing.entries.map((e) => ({
        design_id: e.modelId,
        title: e.title,
        cover: e.cover,
        already_imported: alreadyImported.has(e.modelId),
      })),
    });
  }),
);

// Batch imports run in the background and are polled via GET /import/jobs/:id. One RUNNING job
// per user doubles as the "already in progress" lock.

async function assertNoActiveJob(userId: string): Promise<void> {
  const active = await getActiveJob(userId);
  if (active) throw new HttpError(409, "An import is already in progress");
}

const makerworldProfilesImportRequestSchema = importRequestSchema.extend({
  scope: z.enum(["designer", "all"]),
});

router.post(
  "/import/makerworld-profiles",
  asyncHandler(async (req, res) => {
    const body = await withStoredMakerworldCookie(
      req.userId!,
      parseBody(makerworldProfilesImportRequestSchema, req.body),
    );
    await assertNoActiveJob(req.userId!);
    const url = await normalizeImportUrl(body.url);
    if (!parseMakerworldModelUrl(url)) throw new HttpError(400, "Not a MakerWorld model link");
    const job = await createJob(req.userId!, "PROFILES", {
      sourceUrl: url,
      provider: "makerworld",
    });
    void runMakerworldProfilesImportJob(job.id, req.userId!, { ...body, url });
    res.status(202).json({ job_id: job.id });
  }),
);

const collectionImportRequestSchema = importRequestSchema.extend({
  design_ids: z.array(z.string()).min(1),
});

router.post(
  "/import/collection",
  asyncHandler(async (req, res) => {
    const body = await withStoredMakerworldCookie(req.userId!, parseBody(collectionImportRequestSchema, req.body));
    await assertNoActiveJob(req.userId!);
    const url = await normalizeImportUrl(body.url);
    const job = await createJob(req.userId!, "COLLECTION", {
      sourceUrl: url,
      provider: "makerworld",
      total: body.design_ids.length,
    });
    void runCollectionImportJob(job.id, req.userId!, { ...body, url });
    res.status(202).json({ job_id: job.id });
  }),
);

const thingiverseLikesImportRequestSchema = importRequestSchema.extend({
  thing_ids: z.array(z.string()).min(1),
});

router.post(
  "/import/thingiverse-likes",
  asyncHandler(async (req, res) => {
    const body = parseBody(thingiverseLikesImportRequestSchema, req.body);
    await assertNoActiveJob(req.userId!);
    const url = await normalizeImportUrl(body.url);
    const parsed = parseThingiverseLikesUrl(url);
    if (!parsed) throw new HttpError(400, "Not a Thingiverse Likes URL");
    const job = await createJob(req.userId!, "COLLECTION", {
      sourceUrl: url,
      provider: "thingiverse",
      total: body.thing_ids.length,
    });
    void runThingiverseLikesImportJob(job.id, req.userId!, {
      ...body,
      url,
      username: parsed.username,
    });
    res.status(202).json({ job_id: job.id });
  }),
);

router.post(
  "/import/thingiverse-collection",
  asyncHandler(async (req, res) => {
    const body = parseBody(thingiverseLikesImportRequestSchema, req.body);
    await assertNoActiveJob(req.userId!);
    const url = await normalizeImportUrl(body.url);
    const parsed = parseThingiverseCollectionUrl(url);
    if (!parsed) throw new HttpError(400, "Not a Thingiverse Collection URL");
    const job = await createJob(req.userId!, "COLLECTION", {
      sourceUrl: url,
      provider: "thingiverse",
      total: body.thing_ids.length,
    });
    void runThingiverseCollectionImportJob(job.id, req.userId!, {
      ...body,
      url,
      collectionId: parsed.collectionId,
    });
    res.status(202).json({ job_id: job.id });
  }),
);

const printablesCollectionImportRequestSchema = importRequestSchema.extend({
  model_ids: z.array(z.string()).min(1),
});

router.post(
  "/import/printables-collection",
  asyncHandler(async (req, res) => {
    const body = parseBody(printablesCollectionImportRequestSchema, req.body);
    await assertNoActiveJob(req.userId!);
    const url = await normalizeImportUrl(body.url);
    const parsed = parsePrintablesCollectionUrl(url);
    if (!parsed) throw new HttpError(400, "Not a Printables Collection URL");
    const job = await createJob(req.userId!, "COLLECTION", {
      sourceUrl: url,
      provider: "printables",
      total: body.model_ids.length,
    });
    void runPrintablesCollectionImportJob(job.id, req.userId!, {
      ...body,
      url,
      collectionId: parsed.collectionId,
    });
    res.status(202).json({ job_id: job.id });
  }),
);

const zipExtractRequestSchema = importRequestSchema.extend({
  entries: z.array(z.string()),
});

router.post(
  "/import/zip",
  asyncHandler(async (req, res) => {
    const body = parseBody(zipExtractRequestSchema, req.body);
    await assertNoActiveJob(req.userId!);
    const url = await normalizeImportUrl(body.url);
    const job = await createJob(req.userId!, "ZIP", {
      sourceUrl: url,
      total: body.entries.length,
    });
    void runZipImportJob(job.id, req.userId!, { ...body, url });
    res.status(202).json({ job_id: job.id });
  }),
);

router.get(
  "/import/jobs/active",
  asyncHandler(async (req, res) => {
    const job = await getActiveJob(req.userId!);
    res.json(job ? toImportJobOut(job) : null);
  }),
);

router.get(
  "/import/jobs/:id",
  asyncHandler(async (req, res) => {
    const job = await getJob(req.params.id, req.userId!);
    if (!job) throw new HttpError(404, "Import job not found");
    res.json(toImportJobOut(job));
  }),
);

export default router;
