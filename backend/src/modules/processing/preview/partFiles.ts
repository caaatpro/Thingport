import {
  COMPONENT_RE,
  OBJECT_RE,
  type FastMesh,
  applyAffineToVertices,
  countTriangleTags,
  extractMeshesFast,
  getAttr,
  parseTransform3MF,
} from "./meshes";

// Production-extension 3MFs keep each part's geometry in its own .model file; this loads them lazily.

export const MAX_COMPONENT_DEPTH = 8;

/** The object a component's objectid names, or every object when it names none (or a missing one). */
function partFileTargetIds(objects: Map<string, string>, objectId: string | null): string[] {
  return objectId && objects.has(objectId) ? [objectId] : [...objects.keys()];
}

/** Bambu Studio keeps every part of a multi-part object in one file and references each part by
 * objectid, so a component takes only the object it names.
 *
 * Uses its own regex instances: callers are mid-way through a global OBJECT_RE/COMPONENT_RE scan. */
const innerRefs = (inner: string, objects: Map<string, string>) => {
  const refs: { refId: string; transform: number[] | null }[] = [];
  const componentRe = new RegExp(COMPONENT_RE.source, "g");
  let cm: RegExpExecArray | null;
  while ((cm = componentRe.exec(inner))) {
    const refId = getAttr(cm[1], "objectid");
    const hasPath = (getAttr(cm[1], "p:path") ?? getAttr(cm[1], "path")) !== null;
    if (refId && !hasPath && objects.has(refId))
      refs.push({ refId, transform: parseTransform3MF(getAttr(cm[1], "transform")) });
  }
  return refs;
};

export function createPartFileResolver(loadExternalModel: (path: string) => Promise<string | null>) {
  const objectsByPath = new Map<string, Map<string, string> | null>();
  const meshCache = new Map<string, FastMesh[]>();
  const countCache = new Map<string, number>();

  const objectsIn = async (path: string): Promise<Map<string, string> | null> => {
    if (objectsByPath.has(path)) return objectsByPath.get(path)!;
    const xml = await loadExternalModel(path);
    let objects: Map<string, string> | null = null;
    if (xml) {
      objects = new Map();
      const objectRe = new RegExp(OBJECT_RE.source, "g");
      let om: RegExpExecArray | null;
      while ((om = objectRe.exec(xml))) {
        const id = getAttr(om[1], "id");
        if (id) objects.set(id, om[2]);
      }
    }
    objectsByPath.set(path, objects);
    return objects;
  };

  /** Parsed once however many times it's placed. */
  const objectMeshes = async (
    path: string,
    objects: Map<string, string>,
    id: string,
    depth: number,
  ): Promise<FastMesh[]> => {
    const key = `${path}#${id}`;
    const cached = meshCache.get(key);
    if (cached) return cached;
    const inner = objects.get(id) ?? "";
    const meshes = extractMeshesFast(inner, 0);
    if (depth < MAX_COMPONENT_DEPTH) {
      for (const ref of innerRefs(inner, objects)) {
        for (const mesh of await objectMeshes(path, objects, ref.refId, depth + 1)) {
          meshes.push(
            ref.transform ? { ...mesh, vertices: applyAffineToVertices(mesh.vertices, ref.transform) } : mesh,
          );
        }
      }
    }
    meshCache.set(key, meshes);
    return meshes;
  };

  const objectTriangles = (path: string, objects: Map<string, string>, id: string, depth: number): number => {
    const key = `${path}#${id}`;
    const cached = countCache.get(key);
    if (cached !== undefined) return cached;
    const inner = objects.get(id) ?? "";
    let count = countTriangleTags(inner);
    if (depth < MAX_COMPONENT_DEPTH) {
      for (const ref of innerRefs(inner, objects)) count += objectTriangles(path, objects, ref.refId, depth + 1);
    }
    countCache.set(key, count);
    return count;
  };

  return {
    async meshes(path: string, objectId: string | null): Promise<FastMesh[]> {
      const objects = await objectsIn(path);
      if (!objects) return [];
      const out: FastMesh[] = [];
      for (const id of partFileTargetIds(objects, objectId)) out.push(...(await objectMeshes(path, objects, id, 0)));
      return out;
    },
    async triangles(path: string, objectId: string | null): Promise<number> {
      const objects = await objectsIn(path);
      if (!objects) return 0;
      return partFileTargetIds(objects, objectId).reduce((sum, id) => sum + objectTriangles(path, objects, id, 0), 0);
    },
  };
}

export type PartFileResolver = ReturnType<typeof createPartFileResolver>;
