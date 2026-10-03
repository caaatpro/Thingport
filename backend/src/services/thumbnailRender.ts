import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { BufferGeometry, Mesh } from "three";

// No GPU on the server, so mesh models (STL/OBJ) that carry no embedded preview are turned into a
// thumbnail with a tiny pure-JS flat-shaded isometric rasterizer. Good enough for a card image; the
// in-browser viewer still renders the real thing. Rendered at 2x then downscaled by sharp for AA.

const OUT = 512;
const SS = 2; // supersample factor
const RES = OUT * SS;
const MAX_TRIANGLES = 600_000; // cap work on huge meshes; sample beyond this
const BASE_COLOR = [150, 170, 190] as const; // cool neutral grey-blue
const AMBIENT = 0.3;

/** Expand a (optionally indexed) position array into a flat per-triangle vertex array, sampling down
 *  if the mesh is larger than MAX_TRIANGLES. */
function expandTriangles(posArr: ArrayLike<number>, index: ArrayLike<number> | null): Float32Array | null {
  const triCount = index ? index.length / 3 : posArr.length / 9;
  if (triCount < 1) return null;
  const stride = Math.max(1, Math.ceil(triCount / MAX_TRIANGLES));
  const outTris = Math.ceil(triCount / stride);
  const out = new Float32Array(outTris * 9);
  let o = 0;
  for (let tri = 0; tri < triCount; tri += stride) {
    for (let v = 0; v < 3; v++) {
      const vi = index ? index[tri * 3 + v] : tri * 3 + v;
      out[o++] = posArr[vi * 3];
      out[o++] = posArr[vi * 3 + 1];
      out[o++] = posArr[vi * 3 + 2];
    }
  }
  return out;
}

type LoadedMesh = { tris: Float32Array; triangleCount: number };

function geometryTriangles(geometry: BufferGeometry): LoadedMesh | null {
  const pos = geometry.getAttribute("position");
  if (!pos) return null;
  const index = geometry.getIndex();
  const tris = expandTriangles(pos.array as ArrayLike<number>, index ? (index.array as ArrayLike<number>) : null);
  if (!tris) return null;
  const triangleCount = index ? index.count / 3 : pos.count / 3;
  return { tris, triangleCount };
}

type OcctModule = {
  ReadStepFile: (data: Uint8Array, params: unknown) => { meshes?: OcctMesh[] } | null;
};
type OcctMesh = { attributes?: { position?: { array: ArrayLike<number> } }; index?: { array: ArrayLike<number> } };

let occtPromise: Promise<OcctModule> | null = null;
async function getOcct(): Promise<OcctModule> {
  if (!occtPromise) {
    const initOcct = (await import("occt-import-js")).default as (opts?: unknown) => Promise<OcctModule>;
    // CommonJS runtime: point emscripten at the wasm shipped with the package so Node can find it.
    const wasmPath = require.resolve("occt-import-js/dist/occt-import-js.wasm");
    occtPromise = initOcct({ locateFile: (f: string) => (f.endsWith(".wasm") ? wasmPath : f) });
  }
  return occtPromise;
}

function mergeMeshes(chunks: LoadedMesh[]): LoadedMesh | null {
  if (!chunks.length) return null;
  const total = chunks.reduce((n, c) => n + c.tris.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  let triangleCount = 0;
  for (const c of chunks) {
    out.set(c.tris, off);
    off += c.tris.length;
    triangleCount += c.triangleCount;
  }
  return { tris: out, triangleCount };
}

async function loadMesh(srcPath: string): Promise<LoadedMesh | null> {
  const ext = path.extname(srcPath).toLowerCase();
  if (ext === ".stl") {
    const buf = await fs.readFile(srcPath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const geo = new STLLoader().parse(ab as ArrayBuffer);
    return geometryTriangles(geo);
  }
  if (ext === ".obj") {
    const text = await fs.readFile(srcPath, "utf8");
    const group = new OBJLoader().parse(text);
    const chunks: LoadedMesh[] = [];
    group.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh && mesh.geometry) {
        const m = geometryTriangles(mesh.geometry as BufferGeometry);
        if (m) chunks.push(m);
      }
    });
    return mergeMeshes(chunks);
  }
  if (ext === ".step" || ext === ".stp") {
    const buf = await fs.readFile(srcPath);
    const occt = await getOcct();
    const res = occt.ReadStepFile(new Uint8Array(buf), null);
    if (!res || !res.meshes) return null;
    const chunks: LoadedMesh[] = [];
    for (const m of res.meshes) {
      const pos = m.attributes?.position?.array;
      if (!pos || !pos.length) continue;
      const idx = m.index?.array ?? null;
      const tris = expandTriangles(pos, idx);
      if (tris) chunks.push({ tris, triangleCount: idx ? idx.length / 3 : pos.length / 9 });
    }
    return mergeMeshes(chunks);
  }
  return null;
}

export type ModelDimensions = { x: number; y: number; z: number };

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

/** Renders the triangles to an RGBA buffer (RES×RES) via an isometric flat-shaded rasterizer. */
function rasterize(tris: Float32Array): Buffer {
  const triCount = tris.length / 9;
  // Isometric view rotation: yaw -45°, pitch 30°.
  const a = (-45 * Math.PI) / 180;
  const e = (30 * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const ce = Math.cos(e);
  const se = Math.sin(e);
  const rot = (x: number, y: number, z: number): [number, number, number] => {
    const x1 = x * ca + z * sa;
    const z1 = -x * sa + z * ca;
    const y2 = y * ce - z1 * se;
    const z2 = y * se + z1 * ce;
    return [x1, y2, z2];
  };

  // View-space bounds for fit-to-frame.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const view = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    const [vx, vy, vz] = rot(tris[i], tris[i + 1], tris[i + 2]);
    view[i] = vx;
    view[i + 1] = vy;
    view[i + 2] = vz;
    if (vx < minX) minX = vx;
    if (vx > maxX) maxX = vx;
    if (vy < minY) minY = vy;
    if (vy > maxY) maxY = vy;
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const margin = 0.9;
  const scale = (RES * margin) / Math.max(spanX, spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const toPx = (vx: number, vy: number): [number, number] => [
    RES / 2 + (vx - cx) * scale,
    RES / 2 - (vy - cy) * scale, // flip Y to screen space
  ];

  const rgba = new Uint8ClampedArray(RES * RES * 4);
  const zbuf = new Float32Array(RES * RES).fill(-Infinity);
  // Light from the upper-right-front, in view space (+Z toward viewer).
  const ll = Math.hypot(0.4, 0.5, 0.75);
  const lx = 0.4 / ll;
  const ly = 0.5 / ll;
  const lz = 0.75 / ll;

  for (let t = 0; t < triCount; t++) {
    const b = t * 9;
    const ax = view[b];
    const ay = view[b + 1];
    const az = view[b + 2];
    const bx = view[b + 3];
    const by = view[b + 4];
    const bz = view[b + 5];
    const cx3 = view[b + 6];
    const cy3 = view[b + 7];
    const cz3 = view[b + 8];
    // Face normal (view space).
    let nx = (by - ay) * (cz3 - az) - (bz - az) * (cy3 - ay);
    let ny = (bz - az) * (cx3 - ax) - (bx - ax) * (cz3 - az);
    let nz = (bx - ax) * (cy3 - ay) - (by - ay) * (cx3 - ax);
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    if (nz < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
    const shade = Math.min(1, AMBIENT + (1 - AMBIENT) * diff);
    const r = BASE_COLOR[0] * shade;
    const g = BASE_COLOR[1] * shade;
    const bl = BASE_COLOR[2] * shade;

    const [p0x, p0y] = toPx(ax, ay);
    const [p1x, p1y] = toPx(bx, by);
    const [p2x, p2y] = toPx(cx3, cy3);
    const minPx = Math.max(0, Math.floor(Math.min(p0x, p1x, p2x)));
    const maxPx = Math.min(RES - 1, Math.ceil(Math.max(p0x, p1x, p2x)));
    const minPy = Math.max(0, Math.floor(Math.min(p0y, p1y, p2y)));
    const maxPy = Math.min(RES - 1, Math.ceil(Math.max(p0y, p1y, p2y)));
    const area = (p1x - p0x) * (p2y - p0y) - (p2x - p0x) * (p1y - p0y);
    if (Math.abs(area) < 1e-6) continue;
    const invArea = 1 / area;
    for (let py = minPy; py <= maxPy; py++) {
      for (let px = minPx; px <= maxPx; px++) {
        const sx = px + 0.5;
        const sy = py + 0.5;
        const w0 = ((p1x - sx) * (p2y - sy) - (p2x - sx) * (p1y - sy)) * invArea;
        const w1 = ((p2x - sx) * (p0y - sy) - (p0x - sx) * (p2y - sy)) * invArea;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const depth = w0 * az + w1 * bz + w2 * cz3;
        const idx = py * RES + px;
        if (depth <= zbuf[idx]) continue;
        zbuf[idx] = depth;
        const o = idx * 4;
        rgba[o] = r;
        rgba[o + 1] = g;
        rgba[o + 2] = bl;
        rgba[o + 3] = 255;
      }
    }
  }
  return Buffer.from(rgba.buffer);
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
