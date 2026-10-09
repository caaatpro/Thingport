import type { Router } from "express";
import { createRouter } from "../../http/route";
import { badRequest } from "../../http/errors";
import { fileRouter } from "./fileRoutes";
import { plateRouter } from "./plateRoutes";
import { previewImageRouter } from "./previewImageRoutes";
import { estimateDownloadSize, downloadZipName, resolvePrintsForDownload } from "./downloadZip";
import { listPrints, listTagNames } from "./listing";
import {
  deletePrint,
  recordDownload,
  resetAuthor,
  setCategory,
  setFavorite,
  setTags,
  updateMeta,
  viewPrint,
} from "./mutations";
import {
  categoryBody,
  downloadBody,
  downloadFilterBody,
  listPrintsQuery,
  metaBody,
  printFiltersQuery,
  sharesBody,
  tagsBody,
  uploadForm,
} from "./schemas";
import { listShares, setShares } from "./sharing";
import { modelUpload } from "../../http/upload";
import { removeTempFiles, uploadModels, type UploadedFile } from "./uploads";
import { sendPrintsZip } from "./zipResponse";

const api = createRouter();

api.post("/upload", { use: [modelUpload.array("files")], body: uploadForm }, async ({ req, body, userId }) => {
  const files = (req.files as UploadedFile[] | undefined) ?? [];
  try {
    return { prints: await uploadModels(userId, files, body) };
  } finally {
    await removeTempFiles(files);
  }
});

api.get("/prints", { query: listPrintsQuery }, async ({ res, query, userId }) => {
  const { items, paging } = await listPrints(userId, query);
  if (paging) {
    res.setHeader("X-Has-More", paging.hasMore ? "true" : "false");
    res.setHeader("X-Next-Offset", String(paging.nextOffset));
    // Total across all pages, e.g. for a hover card's "N models".
    res.setHeader("X-Total-Count", String(paging.total));
  }
  return items;
});

api.get("/print/:id", ({ params, userId }) => viewPrint(userId, params.id));
api.post("/print/:id/favorite", ({ params, userId }) => setFavorite(userId, params.id, true));
api.delete("/print/:id/favorite", ({ params, userId }) => setFavorite(userId, params.id, false));
api.post("/print/:id/download", ({ params, userId }) => recordDownload(userId, params.id));

api.get("/tags", { query: printFiltersQuery }, ({ query, userId }) => listTagNames(userId, query));

// Download filters combine with AND; /summary estimates count and size from stored columns without
// touching the filesystem.
function assertDownloadFilterGiven(body: {
  print_ids?: string[];
  tag?: string;
  category_id?: string;
  collection_id?: string;
}) {
  if (!(body.print_ids?.length || body.tag || body.category_id || body.collection_id)) {
    throw badRequest("Provide print_ids, tag, category_id, or collection_id to download.");
  }
}

api.post("/download/zip/summary", { body: downloadFilterBody }, async ({ body, userId }) => {
  assertDownloadFilterGiven(body);
  const prints = await resolvePrintsForDownload(userId, body);
  return { count: prints.length, size_bytes: await estimateDownloadSize(prints) };
});

api.post("/download/zip", { body: downloadBody }, async ({ res, body, userId }) => {
  assertDownloadFilterGiven(body);
  const prints = await resolvePrintsForDownload(userId, body);
  const downloadName = await downloadZipName(userId, body, prints, body.filename);
  // Tag and collection downloads span categories, so they skip per-category subfolders.
  await sendPrintsZip(res, prints, downloadName, { flatten: Boolean(body.tag || body.collection_id) });
});

api.post("/print/:id/tags", { body: tagsBody }, async ({ params, body, userId }) => ({
  print: await setTags(userId, params.id, body.tags),
}));
api.post("/print/:id/meta", { body: metaBody }, async ({ params, body, userId }) => ({
  print: await updateMeta(userId, params.id, body),
}));
api.post("/print/:id/category", { body: categoryBody }, async ({ params, body, userId }) => ({
  print: await setCategory(userId, params.id, body.category_id),
}));
api.post("/print/:id/author-reset", async ({ params, userId }) => ({ print: await resetAuthor(userId, params.id) }));

api.delete("/print/:id", async ({ params, userId }) => {
  await deletePrint(userId, params.id);
  return { ok: true };
});

api.get("/print/:id/shares", ({ params, userId }) => listShares(userId, params.id));
api.put("/print/:id/shares", { body: sharesBody }, ({ params, body, userId }) =>
  setShares(userId, params.id, body.user_ids),
);

export const routers: Router[] = [api.router, plateRouter.router, previewImageRouter.router, fileRouter.router];
