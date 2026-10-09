import fs from "node:fs/promises";
import path from "node:path";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type { BufferGeometry, Mesh } from "three";

// Reads STL / OBJ / STEP files into a flat per-triangle vertex array.

const MAX_TRIANGLES = 600_000; // cap work on huge meshes; sample beyond this

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

export type LoadedMesh = { tris: Float32Array; triangleCount: number };

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

export async function loadMesh(srcPath: string): Promise<LoadedMesh | null> {
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
