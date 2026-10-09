import fs from "node:fs/promises";
import path from "node:path";
import { MODEL_PREVIEWS } from "../../../config";
import { logger } from "../../../lib/logger";
import { PREVIEW_FORMAT_VERSION } from "./cachePaths";

// Models rarely look different above 1M triangles on screen. Defined here so the server thread
// never loads the renderer.
export const SIMPLIFY_TARGET_TRIANGLES = 1_000_000;

type GlbSummary = { triangles: number; simplified: boolean };

/** Reads only a cached GLB's JSON chunk. Null for a file this renderer didn't write. */
async function readGlbSummary(file: string): Promise<GlbSummary | null> {
  const handle = await fs.open(file, "r");
  try {
    const header = Buffer.alloc(20);
    await handle.read(header, 0, 20, 0);
    if (header.readUInt32LE(0) !== 0x46546c67 || header.readUInt32LE(16) !== 0x4e4f534a) return null;
    const json = Buffer.alloc(header.readUInt32LE(12));
    await handle.read(json, 0, json.length, 20);
    const gltf = JSON.parse(json.toString("utf-8")) as {
      accessors?: { count: number }[];
      meshes?: { primitives: { indices?: number }[] }[];
      nodes?: { extras?: { thingportPreview?: string } }[];
    };
    let triangles = 0;
    for (const mesh of gltf.meshes ?? []) {
      for (const primitive of mesh.primitives) {
        if (primitive.indices !== undefined) triangles += (gltf.accessors?.[primitive.indices]?.count ?? 0) / 3;
      }
    }
    const meta = gltf.nodes?.find((node) => typeof node.extras?.thingportPreview === "string")?.extras
      ?.thingportPreview;
    const simplified = meta ? Boolean((JSON.parse(meta) as { simplified?: unknown }).simplified) : false;
    return { triangles, simplified };
  } finally {
    await handle.close();
  }
}

/** Removes the cached previews the new setting would change, so they're rebuilt on next view. */
export async function dropPreviewsAffectedBySimplification(simplify: boolean): Promise<number> {
  const suffix = `.v${PREVIEW_FORMAT_VERSION}.glb`;
  let removed = 0;
  let names: string[];
  try {
    names = await fs.readdir(MODEL_PREVIEWS);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!name.endsWith(suffix)) continue;
    const file = path.join(MODEL_PREVIEWS, name);
    try {
      const summary = await readGlbSummary(file);
      if (!summary) continue;
      const affected = simplify
        ? !summary.simplified && summary.triangles > SIMPLIFY_TARGET_TRIANGLES
        : summary.simplified;
      if (affected) {
        await fs.rm(file, { force: true });
        removed++;
      }
    } catch (err) {
      logger.warn(`Couldn't check cached preview ${name} after a simplification change`, { error: err });
    }
  }
  return removed;
}
