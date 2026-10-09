import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { THUMBS } from "../../config";
import { prisma } from "../../db";
import { listZipEntries, readZipEntry } from "../../lib/zipReader";

async function saveThumbBuffer(plateId: string, input: Buffer): Promise<boolean> {
  const dest = path.join(THUMBS, `${plateId}.jpg`);
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  try {
    await sharp(input)
      .flatten({ background: { r: 248, g: 250, b: 252 } })
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(tmp);
    await fs.rename(tmp, dest);
    return true;
  } catch {
    await fs.rm(tmp, { force: true });
    return false;
  }
}

export async function saveThumbFromFile(plateId: string, srcPath: string): Promise<boolean> {
  try {
    const buf = await fs.readFile(srcPath);
    return await saveThumbBuffer(plateId, buf);
  } catch {
    return false;
  }
}

export async function saveThumbFromBytes(plateId: string, data: Buffer): Promise<boolean> {
  return saveThumbBuffer(plateId, data);
}

const THUMBNAIL_ENTRY_PRIORITY: Record<string, number> = {
  "metadata/thumbnail.png": 0,
  "3d/thumbnail.png": 1,
  "thumbnail.png": 2,
};

/** Extracts an embedded thumbnail image from a .3mf archive's zip payload, if present. */
async function extract3mfThumbnail(plateId: string, srcPath: string): Promise<boolean> {
  if (!srcPath.toLowerCase().endsWith(".3mf")) return false;
  try {
    const entries = await listZipEntries(srcPath);
    const imageNames = entries
      .filter((e) => !e.isDirectory)
      .filter((e) => /\.(png|jpe?g|webp)$/i.test(e.name) && /thumbnail/i.test(path.basename(e.name)))
      .filter((e) => e.size <= 16 * 1024 * 1024)
      .toSorted((a, b) => {
        const pa = THUMBNAIL_ENTRY_PRIORITY[a.name.toLowerCase().replace(/^\//, "")] ?? 10;
        const pb = THUMBNAIL_ENTRY_PRIORITY[b.name.toLowerCase().replace(/^\//, "")] ?? 10;
        return pa - pb || a.name.length - b.name.length;
      });
    for (const entry of imageNames) {
      const buf = await readZipEntry(srcPath, entry.name, 16 * 1024 * 1024);
      if (buf && (await saveThumbBuffer(plateId, buf))) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Extracts Fusion 360's embedded preview PNG from a .f3d/.f3z zip (a PNG under a "Previews" folder).
 *  There is no reliable open-source 3D rendering for these, so this static image is the preview. */
export async function extractFusionThumbnail(plateId: string, srcPath: string): Promise<boolean> {
  const lower = srcPath.toLowerCase();
  if (!lower.endsWith(".f3d") && !lower.endsWith(".f3z")) return false;
  try {
    const entries = await listZipEntries(srcPath);
    const candidates = entries
      .filter((e) => !e.isDirectory)
      .filter((e) => /\.png$/i.test(e.name) && /previews?\//i.test(e.name))
      .filter((e) => e.size > 0 && e.size <= 16 * 1024 * 1024)
      // Fusion stores several sizes; the largest makes the best card image.
      .toSorted((a, b) => b.size - a.size);
    for (const entry of candidates) {
      const buf = await readZipEntry(srcPath, entry.name, 16 * 1024 * 1024);
      if (buf && (await saveThumbBuffer(plateId, buf))) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function ensurePlateThumbnail(plateId: string, srcPath: string): Promise<boolean> {
  const existing = path.join(THUMBS, `${plateId}.jpg`);
  if (fsSync.existsSync(existing)) return true;
  return extract3mfThumbnail(plateId, srcPath);
}

function round2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

async function persistPlateMeasure(
  plateId: string,
  m: { dims: { x: number; y: number; z: number }; triangleCount: number },
): Promise<void> {
  await prisma.plate
    .update({
      where: { id: plateId },
      data: {
        dimXmm: round2(m.dims.x),
        dimYmm: round2(m.dims.y),
        dimZmm: round2(m.dims.z),
        triangleCount: m.triangleCount,
      },
    })
    .catch(() => undefined);
}

/** Server-side rendered thumbnail for mesh/CAD models (STL/OBJ/STEP); also persists dimensions. */
export async function renderPlateThumbnail(plateId: string, srcPath: string): Promise<boolean> {
  const { renderModelThumbnail } = await import("../processing/index.js");
  const result = await renderModelThumbnail(srcPath);
  if (!result) return false;
  const ok = await saveThumbBuffer(plateId, result.png);
  await persistPlateMeasure(plateId, result.measure);
  return ok;
}

export function plateThumbPath(plateId: string): string {
  return path.join(THUMBS, `${plateId}.jpg`);
}

export function plateThumbExists(plateId: string): boolean {
  return fsSync.existsSync(plateThumbPath(plateId));
}
