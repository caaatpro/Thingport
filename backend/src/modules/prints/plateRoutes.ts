import { createRouter } from "../../http/route";
import { modelUpload, thumbnailUpload } from "../../http/upload";
import { badRequest, notFound } from "../../http/errors";
import { isNormalizable3mf, normalize3mfStatus, normalized3mfFor } from "../processing/index";
import { IMMUTABLE_PRIVATE_CACHE, sendStoredFile } from "./fileResponse";
import {
  addPlates,
  deletePlate,
  plateGlbPath,
  plateThumbFile,
  printThumbPath,
  readablePlate,
  renamePlate,
  reorderPlates,
  saveGeneratedThumbnail,
} from "./plates";
import { resolvePlateFilePath } from "./printCreation";
import { renamePlateBody, reorderPlatesBody } from "./schemas";
import type { UploadedFile } from "./uploads";

export const plateRouter = createRouter();

plateRouter.post("/print/:id/plates", { use: [modelUpload.array("files")] }, async ({ req, params, userId }) => ({
  print: await addPlates(userId, params.id, (req.files as UploadedFile[] | undefined) ?? []),
}));

plateRouter.delete("/print/:id/plates/:plateId", async ({ params, userId }) => ({
  print: await deletePlate(userId, params.id, params.plateId),
}));

plateRouter.post("/print/:id/plates/reorder", { body: reorderPlatesBody }, async ({ params, body, userId }) => ({
  print: await reorderPlates(userId, params.id, body.plate_ids),
}));

plateRouter.post("/print/:id/plate/:plateId/rename", { body: renamePlateBody }, async ({ params, body, userId }) => ({
  print: await renamePlate(userId, params.id, params.plateId, body.filename),
}));

plateRouter.get("/print/:id/plate/:plateId/file/:filename", async ({ req, res, params, userId }) => {
  const plate = await readablePlate(userId, params.plateId, params.id);
  let filePath = resolvePlateFilePath(plate);
  if (!filePath) throw notFound();
  // Only "Open normalized in <slicer>" asks for it; a plate that is itself a sliced print is never touched.
  if (req.query.normalize === "1" && plate.print.preparedMetadata === null && isNormalizable3mf(plate.filename)) {
    filePath = (await normalized3mfFor(plate.id, filePath)) ?? filePath;
  }
  sendStoredFile(res, filePath, {
    contentType: plate.mime || "application/octet-stream",
    downloadName: plate.filename,
    cacheControl: "private, max-age=86400",
  });
});

// Polled by "Open normalized in <slicer>" until the copy is ready, so no request outlasts a proxy timeout.
plateRouter.post("/print/:id/plate/:plateId/normalize", async ({ params, userId }) => {
  const plate = await readablePlate(userId, params.plateId, params.id);
  if (plate.print.preparedMetadata !== null || !isNormalizable3mf(plate.filename)) {
    throw badRequest("Only a plain 3MF project can be normalized.");
  }
  const filePath = resolvePlateFilePath(plate);
  if (!filePath) throw notFound();
  return { status: await normalize3mfStatus(plate.id, filePath) };
});

plateRouter.get("/print/:id/thumb.jpg", async ({ res, params, userId }) => {
  sendStoredFile(res, await printThumbPath(userId, params.id), {
    contentType: "image/jpeg",
    cacheControl: IMMUTABLE_PRIVATE_CACHE,
  });
});

plateRouter.get("/plate/:plateId/thumb.jpg", async ({ res, params, userId }) => {
  sendStoredFile(res, await plateThumbFile(userId, params.plateId), {
    contentType: "image/jpeg",
    cacheControl: IMMUTABLE_PRIVATE_CACHE,
  });
});

plateRouter.get("/plate/:plateId/preview.glb", async ({ res, params, userId }) => {
  sendStoredFile(res, await plateGlbPath(userId, params.plateId), {
    contentType: "model/gltf-binary",
    cacheControl: IMMUTABLE_PRIVATE_CACHE,
  });
});

plateRouter.post(
  "/plate/:plateId/thumbnail-generated",
  { use: [thumbnailUpload.single("file")] },
  async ({ req, params, userId }) => {
    const file = req.file;
    if (!file) throw badRequest("No file uploaded");
    return { print: await saveGeneratedThumbnail(userId, params.plateId, file) };
  },
);
