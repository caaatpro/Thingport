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

/** Expand a geometry's (optionally indexed) position attribute into a flat per-triangle vertex array. */
function geometryTriangles(geometry: BufferGeometry): Float32Array | null {
  const pos = geometry.getAttribute("position");
  if (!pos) return null;
  const posArr = pos.array as ArrayLike<number>;
  const index = geometry.getIndex();
  const triCount = index ? index.count / 3 : pos.count / 3;
  if (triCount < 1) return null;
  const stride = Math.max(1, Math.ceil(triCount / MAX_TRIANGLES));
  const outTris = Math.ceil(triCount / stride);
  const out = new Float32Array(outTris * 9);
  let o = 0;
  for (let tri = 0; tri < triCount; tri += stride) {
    for (let v = 0; v < 3; v++) {
      const vi = index ? (index.array as ArrayLike<number>)[tri * 3 + v] : tri * 3 + v;
      out[o++] = posArr[vi * 3];
      out[o++] = posArr[vi * 3 + 1];
      out[o++] = posArr[vi * 3 + 2];
    }
  }
  return out;
}

async function loadTriangles(srcPath: string): Promise<Float32Array | null> {
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
    const chunks: Float32Array[] = [];
    group.traverse((child) => {
      const mesh = child as Mesh;
      if (mesh.isMesh && mesh.geometry) {
        const t = geometryTriangles(mesh.geometry as BufferGeometry);
        if (t) chunks.push(t);
      }
    });
    if (!chunks.length) return null;
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Float32Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
  return null;
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

/** Returns a PNG buffer thumbnail for a mesh model, or null if it can't be rendered. */
export async function renderModelThumbnail(srcPath: string): Promise<Buffer | null> {
  try {
    const tris = await loadTriangles(srcPath);
    if (!tris || tris.length < 9) return null;
    const raw = rasterize(tris);
    return await sharp(raw, { raw: { width: RES, height: RES, channels: 4 } })
      .resize(OUT, OUT, { fit: "inside" })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}
