import { COMPONENT_RE, ITEM_RE, OBJECT_RE, countTriangleTags, getAttr } from "./meshes";
import { MAX_COMPONENT_DEPTH, type PartFileResolver } from "./partFiles";

/** Triangles the preview would materialize after expanding components and placements, counted
 * from tags so an over-budget file never allocates its geometry. */
export async function countRenderedTriangles(xml: string, partFiles: PartFileResolver): Promise<number> {
  const ownCount = new Map<string, number>();
  const internalRefs = new Map<string, string[]>();

  OBJECT_RE.lastIndex = 0;
  let om: RegExpExecArray | null;
  while ((om = OBJECT_RE.exec(xml))) {
    const objectId = getAttr(om[1], "id");
    if (!objectId) continue;
    const inner = om[2];
    let count = countTriangleTags(inner);
    const refs: string[] = [];
    COMPONENT_RE.lastIndex = 0;
    let cm: RegExpExecArray | null;
    while ((cm = COMPONENT_RE.exec(inner))) {
      const cAttrs = cm[1];
      const extPath = getAttr(cAttrs, "p:path") ?? getAttr(cAttrs, "path");
      const compObjectId = getAttr(cAttrs, "objectid");
      if (extPath) {
        count += await partFiles.triangles(extPath, compObjectId);
      } else if (compObjectId) {
        refs.push(compObjectId);
      }
    }
    ownCount.set(objectId, count);
    if (refs.length > 0) internalRefs.set(objectId, refs);
  }

  // Memoized so a pathological fan-out can't make the count itself explode.
  const memo = new Map<string, number>();
  const totalFor = (objectId: string, depth: number): number => {
    const key = `${objectId}:${depth}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let total = ownCount.get(objectId) ?? 0;
    if (depth < MAX_COMPONENT_DEPTH) {
      for (const ref of internalRefs.get(objectId) ?? []) total += totalFor(ref, depth + 1);
    }
    memo.set(key, total);
    return total;
  };

  let rendered = 0;
  const buildMatch = xml.match(/<build\b[\s\S]*?<\/build>/);
  if (buildMatch) {
    ITEM_RE.lastIndex = 0;
    let im: RegExpExecArray | null;
    while ((im = ITEM_RE.exec(buildMatch[0]))) {
      const objectId = getAttr(im[1], "objectid");
      if (objectId) rendered += totalFor(objectId, 0);
    }
  }
  return rendered;
}
