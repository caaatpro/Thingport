import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PREVIEWS } from "../../config";
import { prisma } from "../../db";
import { badRequest, notFound } from "../../http/errors";
import type { PreviewImage } from "../../generated/prisma/client";
import { renumberInTwoPhases } from "./positions";

export function previewImagePath(id: string): string {
  return path.join(PREVIEWS, `${id}.jpg`);
}

export function previewImageExists(id: string): boolean {
  return fsSync.existsSync(previewImagePath(id));
}

async function saveBuffer(id: string, input: Buffer): Promise<boolean> {
  const dest = previewImagePath(id);
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  try {
    // Hero-sized: this is the detail page's main image.
    await sharp(input)
      .flatten({ background: { r: 248, g: 250, b: 252 } })
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90, mozjpeg: true })
      .toFile(tmp);
    await fs.rename(tmp, dest);
    return true;
  } catch {
    await fs.rm(tmp, { force: true });
    return false;
  }
}

/** Null if the buffer isn't a decodable image; never throws. */
export async function addPreviewImage(printId: string, buffer: Buffer): Promise<PreviewImage | null> {
  const last = await prisma.previewImage.findFirst({ where: { printId }, orderBy: { position: "desc" } });
  const position = last ? last.position + 1 : 0;
  const row = await prisma.previewImage.create({ data: { printId, position } });
  const ok = await saveBuffer(row.id, buffer);
  if (!ok) {
    await prisma.previewImage.delete({ where: { id: row.id } }).catch(() => undefined);
    return null;
  }
  return row;
}

/** An existing image (e.g. an import's cover) always wins. */
export async function addGeneratedPreviewImageIfNone(printId: string, buffer: Buffer): Promise<void> {
  const count = await prisma.previewImage.count({ where: { printId } });
  if (count > 0) return;
  await addPreviewImage(printId, buffer);
}

/** Adds every uploaded image to the gallery; undecodable ones are skipped rather than failing the batch. */
export async function addPreviewImages(printId: string, buffers: Buffer[]): Promise<void> {
  for (const buffer of buffers) {
    await addPreviewImage(printId, buffer);
  }
}

function renumberInPositions(ids: string[]): Promise<void> {
  return renumberInTwoPhases((id, position) => prisma.previewImage.update({ where: { id }, data: { position } }), ids);
}

export async function deletePreviewImage(printId: string, imageId: string): Promise<void> {
  const images = await prisma.previewImage.findMany({ where: { printId }, orderBy: { position: "asc" } });
  const target = images.find((img) => img.id === imageId);
  if (!target) throw notFound("Preview image not found");

  await prisma.previewImage.delete({ where: { id: target.id } });
  await renumberInPositions(images.filter((img) => img.id !== target.id).map((img) => img.id));
  await fs.rm(previewImagePath(target.id), { force: true }).catch(() => undefined);
}

export async function reorderPreviewImages(printId: string, imageIds: string[]): Promise<void> {
  const images = await prisma.previewImage.findMany({ where: { printId } });
  const known = new Set(images.map((img) => img.id));
  if (imageIds.length !== images.length || imageIds.some((id) => !known.has(id))) {
    throw badRequest("image_ids must contain exactly the print's current preview image ids");
  }
  await renumberInPositions(imageIds);
}

export async function deleteAllPreviewImages(printId: string): Promise<void> {
  const rows = await prisma.previewImage.findMany({ where: { printId } });
  await prisma.previewImage.deleteMany({ where: { printId } });
  for (const row of rows) {
    await fs.rm(previewImagePath(row.id), { force: true }).catch(() => undefined);
  }
}
