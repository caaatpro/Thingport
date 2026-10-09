import sharp from "sharp";
import { loadMesh } from "./meshLoad";
import { OUT, RES, rasterize } from "./rasterize";

type ModelDimensions = { x: number; y: number; z: number };

function measureDims(tris: Float32Array): ModelDimensions {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < tris.length; i += 3) {
    const x = tris[i];
    const y = tris[i + 1];
    const z = tris[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
}

export type ModelMeasure = { dims: ModelDimensions; triangleCount: number };

/** Loads a mesh/CAD model and returns its bounding-box size + triangle count, without rendering. */
export async function measureModel(srcPath: string): Promise<ModelMeasure | null> {
  try {
    const mesh = await loadMesh(srcPath);
    if (!mesh || mesh.tris.length < 9) return null;
    return { dims: measureDims(mesh.tris), triangleCount: mesh.triangleCount };
  } catch {
    return null;
  }
}

export type RenderedThumbnail = { png: Buffer; measure: ModelMeasure };

/** Renders a PNG thumbnail for a mesh/CAD model and measures it, or null if it can't be rendered. */
export async function renderModelThumbnail(srcPath: string): Promise<RenderedThumbnail | null> {
  try {
    const mesh = await loadMesh(srcPath);
    if (!mesh || mesh.tris.length < 9) return null;
    const raw = rasterize(mesh.tris);
    const png = await sharp(raw, { raw: { width: RES, height: RES, channels: 4 } })
      .resize(OUT, OUT, { fit: "inside" })
      .png()
      .toBuffer();
    return { png, measure: { dims: measureDims(mesh.tris), triangleCount: mesh.triangleCount } };
  } catch {
    return null;
  }
}
