// Regex-based extraction of 3MF mesh geometry: a DOM hangs on models with millions of triangles.

export function getAttr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/** Different Bambu Studio versions spell it plate_id or plater_id. */
export function findPlateIdAttr(attrs: string): number | null {
  const m = attrs.match(/(?:^|\s)(?:[\w-]+:)?(?:plate_id|plater_id|plateid|platerid)="([^"]*)"/i);
  if (!m) return null;
  const parsed = Number.parseInt(m[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 3MF's 3x4 affine transform: [m00 m01 m02 m10 m11 m12 m20 m21 m22 tx ty tz]. */
export function parseTransform3MF(str: string | null): number[] | null {
  if (!str) return null;
  const v = str.trim().split(/\s+/).map(Number);
  return v.length >= 12 ? v : null;
}

export function applyAffineToVertices(vertices: Float32Array, t: number[]): Float32Array {
  const out = new Float32Array(vertices.length);
  const [t0, t1, t2, t3, t4, t5, t6, t7, t8, t9, t10, t11] = t;
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i];
    const y = vertices[i + 1];
    const z = vertices[i + 2];
    out[i] = t0 * x + t1 * y + t2 * z + t9;
    out[i + 1] = t3 * x + t4 * y + t5 * z + t10;
    out[i + 2] = t6 * x + t7 * y + t8 * z + t11;
  }
  return out;
}

export type FastMesh = { vertices: Float32Array; triangles: Uint32Array; extruder: number };

const MESH_RE = /<mesh\b[^>]*>([\s\S]*?)<\/mesh>/g;
const VERTEX_RE = /<vertex\s+x="([^"]*)"\s+y="([^"]*)"\s+z="([^"]*)"/g;
const TRIANGLE_RE = /<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/g;

export const OBJECT_RE = /<object\b([^>]*)>([\s\S]*?)<\/object>/g;
export const COMPONENT_RE = /<component\b([^>]*)\/?>/g;
export const ITEM_RE = /<item\b([^>]*)\/?>/g;

/** Extracts every <mesh>'s vertices/triangles via regex, without building a DOM. */
export function extractMeshesFast(xml: string, extruder: number): FastMesh[] {
  const meshes: FastMesh[] = [];
  MESH_RE.lastIndex = 0;
  let meshMatch: RegExpExecArray | null;
  while ((meshMatch = MESH_RE.exec(xml))) {
    const inner = meshMatch[1];
    const vertices: number[] = [];
    VERTEX_RE.lastIndex = 0;
    let vm: RegExpExecArray | null;
    while ((vm = VERTEX_RE.exec(inner))) {
      vertices.push(parseFloat(vm[1]), parseFloat(vm[2]), parseFloat(vm[3]));
    }
    const triangles: number[] = [];
    TRIANGLE_RE.lastIndex = 0;
    let tm: RegExpExecArray | null;
    while ((tm = TRIANGLE_RE.exec(inner))) {
      triangles.push(parseInt(tm[1], 10), parseInt(tm[2], 10), parseInt(tm[3], 10));
    }
    if (vertices.length > 0 && triangles.length > 0) {
      meshes.push({ vertices: Float32Array.from(vertices), triangles: Uint32Array.from(triangles), extruder });
    }
  }
  return meshes;
}

/** Counts <triangle .../> tags without allocating a match array. */
export function countTriangleTags(xml: string): number {
  let count = 0;
  let i = xml.indexOf("<triangle");
  while (i !== -1) {
    const next = xml.charCodeAt(i + 9);
    if (next === 32 || next === 9 || next === 10 || next === 13 || next === 47 || next === 62) count++;
    i = xml.indexOf("<triangle", i + 9);
  }
  return count;
}
