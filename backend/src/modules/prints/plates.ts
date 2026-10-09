import fs from "node:fs";
import { prisma } from "../../db";
import { badRequest, conflict, HttpError, notFound, payloadTooLarge } from "../../http/errors";
import type { Plate } from "../../generated/prisma/client";
import { sanitizeFilename } from "../../utils/fileUtils";
import { generateModelPreviewGlb, modelPreviewGlbPath, modelPreviewState } from "../../services/modelPreviewCache";
import { getPreviewMode } from "../../services/settingsService";
import { printReadWhere, printWriteWhere } from "./access";
import { requireWritablePrint } from "./lookup";
import { availablePlateFilename } from "./naming";
import { plateThumbExists, plateThumbPath, saveThumbFromBytes } from "./plateThumbnails";
import { renumberInTwoPhases } from "./positions";
import { addPlatesToPrint, deletePlateFiles, refreshAutoPreparedMetadata, resolvePlateFilePath } from "./printCreation";
import { printOutById } from "./printLoader";
import { addGeneratedPreviewImageIfNone } from "./previewImages";
import { relocatePrint } from "./storage";
import { removeTempFiles, toPlateInput, type UploadedFile } from "./uploads";

const GENERATED_THUMB_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const GENERATED_THUMB_MAX_BYTES = 8 * 1024 * 1024;

function renumberPlates(ids: string[]): Promise<void> {
  return renumberInTwoPhases((id, position) => prisma.plate.update({ where: { id }, data: { position } }), ids);
}

export async function addPlates(userId: string, printId: string, files: UploadedFile[]) {
  try {
    if (!files.length) throw badRequest("No files uploaded");
    const print = await requireWritablePrint(userId, printId, "EDIT");
    await addPlatesToPrint(print.userId, print.id, files.map(toPlateInput));
  } finally {
    await removeTempFiles(files);
  }
  return printOutById(userId, printId);
}

export async function deletePlate(userId: string, printId: string, plateId: string) {
  const print = await requireWritablePrint(userId, printId, "EDIT");
  const plates = await prisma.plate.findMany({ where: { printId: print.id }, orderBy: { position: "asc" } });
  const target = plates.find((p) => p.id === plateId);
  if (!target) throw notFound("Plate not found");
  if (plates.length <= 1) {
    throw conflict("Cannot remove the only plate of a print; delete the print instead.");
  }

  await prisma.plate.delete({ where: { id: target.id } });
  await renumberPlates(plates.filter((p) => p.id !== target.id).map((p) => p.id));
  await deletePlateFiles(target);
  await fs.promises.rm(plateThumbPath(target.id), { force: true }).catch(() => undefined);

  if (target.position === 0) await refreshAutoPreparedMetadata(print.id);
  return printOutById(userId, print.id);
}

export async function reorderPlates(userId: string, printId: string, plateIds: string[]) {
  const print = await requireWritablePrint(userId, printId, "EDIT");
  const plates = await prisma.plate.findMany({ where: { printId: print.id } });
  const known = new Set(plates.map((p) => p.id));
  if (plateIds.length !== plates.length || plateIds.some((id) => !known.has(id))) {
    throw badRequest("plate_ids must contain exactly the print's current plate ids");
  }
  const previousFirst = plates.toSorted((a, b) => a.position - b.position)[0]?.id;

  await renumberPlates(plateIds);

  if (previousFirst !== plateIds[0]) await refreshAutoPreparedMetadata(print.id);
  return printOutById(userId, print.id);
}

export async function renamePlate(userId: string, printId: string, plateId: string, filename: string) {
  const print = await requireWritablePrint(userId, printId, "EDIT");
  const plate = await prisma.plate.findUnique({ where: { id: plateId } });
  if (!plate || plate.printId !== print.id) throw notFound("Plate not found");

  const nextFilename = await availablePlateFilename(print.id, sanitizeFilename(filename), plate.id);
  if (nextFilename !== plate.filename) {
    await prisma.plate.update({ where: { id: plate.id }, data: { filename: nextFilename } });
    await relocatePrint(print, [{ ...plate, filename: nextFilename }]);
    if (plate.position === 0) await refreshAutoPreparedMetadata(print.id);
  }
  return printOutById(userId, print.id);
}

/** A plate of a print the user may read; 404 otherwise. */
export async function readablePlate(userId: string, plateId: string, printId?: string) {
  const plate = await prisma.plate.findFirst({
    where: { id: plateId, ...(printId ? { printId } : {}), print: printReadWhere(userId) },
    include: { print: { select: { preparedMetadata: true } } },
  });
  if (!plate) throw notFound();
  return plate;
}

/** The first plate's thumbnail file of a print the user may read. */
export async function printThumbPath(userId: string, printId: string): Promise<string> {
  const plate0 = await prisma.plate.findFirst({
    where: { printId, print: printReadWhere(userId) },
    orderBy: { position: "asc" },
  });
  if (!plate0) throw notFound();
  return existingThumbPath(plate0.id);
}

export async function plateThumbFile(userId: string, plateId: string): Promise<string> {
  const plate = await readablePlate(userId, plateId);
  return existingThumbPath(plate.id);
}

function existingThumbPath(plateId: string): string {
  if (!plateThumbExists(plateId)) throw notFound();
  return plateThumbPath(plateId);
}

/**
 * The cached GLB of a 3MF plate. When there is none, the error's code tells the viewer what to do:
 * PREVIEW_DISABLED means parse in the browser; otherwise generation is kicked off here and the viewer
 * waits (PREVIEW_GENERATING) or gives up (PREVIEW_FAILED), never parsing a file the server found too heavy.
 */
export async function plateGlbPath(userId: string, plateId: string): Promise<string> {
  const plate = await readablePlate(userId, plateId);
  const glbPath = modelPreviewGlbPath(plate.id);
  if (fs.existsSync(glbPath)) return glbPath;
  if (!plate.filename.toLowerCase().endsWith(".3mf")) throw notFound();
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
  if (state === "failed") throw new HttpError(404, "No preview could be generated for this model", "PREVIEW_FAILED");
  throw new HttpError(404, "Preview is being generated", "PREVIEW_GENERATING");
}

/**
 * Stores a thumbnail the browser rendered, as the fallback for formats the server can't render. One the
 * server (or an earlier upload) already made is kept: a browser without proper WebGL draws a black
 * silhouette that would otherwise replace a good image every time the plate is opened.
 */
export async function saveGeneratedThumbnail(
  userId: string,
  plateId: string,
  file: { mimetype: string; size: number; buffer: Buffer },
) {
  if (!GENERATED_THUMB_TYPES.has((file.mimetype || "").toLowerCase())) {
    throw new HttpError(415, "Generated thumbnail must be PNG, JPEG, or WebP");
  }
  if (file.size > GENERATED_THUMB_MAX_BYTES) throw payloadTooLarge("Generated thumbnail exceeds 8 MB");
  const plate: Plate | null = await prisma.plate.findFirst({
    where: { id: plateId, print: printWriteWhere(userId, "UPLOAD") },
  });
  if (!plate) throw notFound();
  if (!plateThumbExists(plate.id)) {
    if (!(await saveThumbFromBytes(plate.id, file.buffer))) throw badRequest("Invalid thumbnail image");
    // Only when no better preview (e.g. an imported cover) exists.
    await addGeneratedPreviewImageIfNone(plate.printId, file.buffer);
  }
  return printOutById(userId, plate.printId);
}
