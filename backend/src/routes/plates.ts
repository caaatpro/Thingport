import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../auth";
import { HttpError, sanitizeFilename, mimeFromContentType } from "../utils/fileUtils";
import { parseBody } from "../utils/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { modelUpload, thumbnailUpload } from "../uploadMiddleware";
import { printReadWhere, printWriteWhere } from "../services/access";
import {
  addPlatesToPrint,
  deletePlateFiles,
  refreshAutoPreparedMetadata,
  resolvePlateFilePath,
  type NewPlateInput,
} from "../services/printCreation";
import {
  availablePlateFilename,
  plateThumbExists,
  plateThumbPath,
  relocatePrint,
  saveThumbFromBytes,
} from "../services/printService";
import { addGeneratedPreviewImageIfNone } from "../services/previewImageService";
import { printOutById } from "../services/printLoader";
import { generateModelPreviewGlb, modelPreviewGlbPath, modelPreviewState } from "../services/modelPreviewCache";
import { getPreviewMode } from "../services/settingsService";

const router = Router();
router.use(requireAuth);

router.post(
  "/print/:id/plates",
  modelUpload.array("files"),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[]) || [];
    try {
      if (!files.length) throw new HttpError(400, "No files uploaded");
      const print = await prisma.print.findFirst({
        where: { id: req.params.id, ...printWriteWhere(req.userId!, "EDIT") },
      });
      if (!print) throw new HttpError(404, "Print not found");

      const plateInputs: NewPlateInput[] = files.map((f) => {
        const safeName = sanitizeFilename(f.originalname);
        return { filename: safeName, mime: mimeFromContentType(f.mimetype, safeName), tempFilePath: f.path };
      });
      await addPlatesToPrint(print.userId, print.id, plateInputs);
      res.json({ print: await printOutById(req.userId!, print.id) });
    } finally {
      for (const f of files) {
        if (fs.existsSync(f.path)) fs.rmSync(f.path, { force: true });
      }
    }
  }),
);

router.delete(
  "/print/:id/plates/:plateId",
  asyncHandler(async (req, res) => {
    const print = await prisma.print.findFirst({
      where: { id: req.params.id, ...printWriteWhere(req.userId!, "EDIT") },
    });
    if (!print) throw new HttpError(404, "Print not found");
    const plates = await prisma.plate.findMany({ where: { printId: print.id }, orderBy: { position: "asc" } });
    const target = plates.find((p) => p.id === req.params.plateId);
    if (!target) throw new HttpError(404, "Plate not found");
    if (plates.length <= 1) {
      throw new HttpError(409, "Cannot remove the only plate of a print; delete the print instead.");
    }

    const remaining = plates.filter((p) => p.id !== target.id);
    // Renumber in two phases (negative temp positions) to avoid (printId, position) collisions.
    await prisma.plate.delete({ where: { id: target.id } });
    await prisma.$transaction(
      remaining.map((p, idx) => prisma.plate.update({ where: { id: p.id }, data: { position: -(idx + 1) } })),
    );
    await prisma.$transaction(
      remaining.map((p, idx) => prisma.plate.update({ where: { id: p.id }, data: { position: idx } })),
    );
    await deletePlateFiles(target);
    await fs.promises.rm(plateThumbPath(target.id), { force: true }).catch(() => undefined);

    if (target.position === 0) {
      await refreshAutoPreparedMetadata(print.id);
    }
    res.json({ print: await printOutById(req.userId!, print.id) });
  }),
);

const reorderSchema = z.object({ plate_ids: z.array(z.string()).min(1) });
router.post(
  "/print/:id/plates/reorder",
  asyncHandler(async (req, res) => {
    const body = parseBody(reorderSchema, req.body);
    const print = await prisma.print.findFirst({
      where: { id: req.params.id, ...printWriteWhere(req.userId!, "EDIT") },
    });
    if (!print) throw new HttpError(404, "Print not found");
    const plates = await prisma.plate.findMany({ where: { printId: print.id } });
    const byId = new Map(plates.map((p) => [p.id, p]));
    if (body.plate_ids.length !== plates.length || body.plate_ids.some((id) => !byId.has(id))) {
      throw new HttpError(400, "plate_ids must contain exactly the print's current plate ids");
    }
    const previousFirst = plates.toSorted((a, b) => a.position - b.position)[0]?.id;

    await prisma.$transaction(
      body.plate_ids.map((id, idx) => prisma.plate.update({ where: { id }, data: { position: -(idx + 1) } })),
    );
    await prisma.$transaction(
      body.plate_ids.map((id, idx) => prisma.plate.update({ where: { id }, data: { position: idx } })),
    );

    if (previousFirst !== body.plate_ids[0]) {
      await refreshAutoPreparedMetadata(print.id);
    }
    res.json({ print: await printOutById(req.userId!, print.id) });
  }),
);

const renameSchema = z.object({ filename: z.string().min(1) });
router.post(
  "/print/:id/plate/:plateId/rename",
  asyncHandler(async (req, res) => {
    const body = parseBody(renameSchema, req.body);
    const print = await prisma.print.findFirst({
      where: { id: req.params.id, ...printWriteWhere(req.userId!, "EDIT") },
    });
    if (!print) throw new HttpError(404, "Print not found");
    const plate = await prisma.plate.findUnique({ where: { id: req.params.plateId } });
    if (!plate || plate.printId !== print.id) throw new HttpError(404, "Plate not found");

    const sanitized = sanitizeFilename(body.filename);
    const nextFilename = await availablePlateFilename(print.id, sanitized, plate.id);
    if (nextFilename !== plate.filename) {
      await prisma.plate.update({ where: { id: plate.id }, data: { filename: nextFilename } });
      await relocatePrint(print, [{ ...plate, filename: nextFilename }]);
      if (plate.position === 0) {
        await refreshAutoPreparedMetadata(print.id);
      }
    }
    res.json({ print: await printOutById(req.userId!, print.id) });
  }),
);

router.get(
  "/plate/:plateId/thumb.jpg",
  asyncHandler(async (req, res) => {
    const plate = await prisma.plate.findFirst({
      where: { id: req.params.plateId, print: printReadWhere(req.userId!) },
    });
    if (!plate) throw new HttpError(404, "Not found");
    const thumbPath = plateThumbPath(plate.id);
    if (!fs.existsSync(thumbPath)) throw new HttpError(404, "Not found");
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.sendFile(path.resolve(thumbPath));
  }),
);

router.get(
  "/plate/:plateId/preview.glb",
  asyncHandler(async (req, res) => {
    const plate = await prisma.plate.findFirst({
      where: { id: req.params.plateId, print: printReadWhere(req.userId!) },
    });
    if (!plate) throw new HttpError(404, "Not found");
    const glbPath = modelPreviewGlbPath(plate.id);
    if (!fs.existsSync(glbPath)) {
      // The 404's code tells the viewer what to do: PREVIEW_DISABLED means parse in the browser;
      // otherwise generation is kicked off here and the viewer waits (PREVIEW_GENERATING) or gives up
      // (PREVIEW_FAILED), never parsing a file the server found too heavy.
      if (!plate.filename.toLowerCase().endsWith(".3mf")) throw new HttpError(404, "Not found");
      if ((await getPreviewMode()) === "disabled") {
        throw new HttpError(404, "Preview generation is disabled", "PREVIEW_DISABLED");
      }
      const srcPath = resolvePlateFilePath(plate);
      if (!srcPath) throw new HttpError(404, "Model file is missing", "PREVIEW_FAILED");
      void generateModelPreviewGlb(plate.id, srcPath);
      const state = modelPreviewState(plate.id);
      if (state === "unsupported") {
        throw new HttpError(404, "This 3MF's layout isn't supported by the server preview", "PREVIEW_UNSUPPORTED");
      }
      if (state === "failed") {
        throw new HttpError(404, "No preview could be generated for this model", "PREVIEW_FAILED");
      }
      throw new HttpError(404, "Preview is being generated", "PREVIEW_GENERATING");
    }
    res.setHeader("Content-Type", "model/gltf-binary");
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.sendFile(path.resolve(glbPath));
  }),
);

router.post(
  "/plate/:plateId/thumbnail-generated",
  thumbnailUpload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, "No file uploaded");
    if (!["image/png", "image/jpeg", "image/webp"].includes((file.mimetype || "").toLowerCase())) {
      throw new HttpError(415, "Generated thumbnail must be PNG, JPEG, or WebP");
    }
    if (file.size > 8 * 1024 * 1024) throw new HttpError(413, "Generated thumbnail exceeds 8 MB");
    const plate = await prisma.plate.findFirst({
      where: { id: req.params.plateId, print: printWriteWhere(req.userId!, "UPLOAD") },
    });
    if (!plate) throw new HttpError(404, "Not found");
    // A thumbnail the server (or an earlier upload) already made is kept: this is only the fallback for
    // formats the server can't render, and a browser without proper WebGL draws a black silhouette
    // that would otherwise replace a good image every time the plate is opened.
    if (plateThumbExists(plate.id)) {
      res.json({ print: await printOutById(req.userId!, plate.printId) });
      return;
    }
    const ok = await saveThumbFromBytes(plate.id, file.buffer);
    if (!ok) throw new HttpError(400, "Invalid thumbnail image");
    // Only when no better preview (e.g. an imported cover) exists.
    await addGeneratedPreviewImageIfNone(plate.printId, file.buffer);
    res.json({ print: await printOutById(req.userId!, plate.printId) });
  }),
);

export default router;
