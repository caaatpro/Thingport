import { normalizePath, parseAttrs, pathKey } from "./xml";
import { formatTransform, multiplyTransform } from "./transform";

// Reads the 3D model parts of a 3MF (the root model and the production-extension object files).

export const NO_MODEL = "No valid 3D model found inside the 3MF file.";

export type ModelMetadata = { attrs: Record<string, string>; text: string };

// Tolerates unclosed <metadata> tags, which MakerWorld exports emit for an empty Copyright.
export function extractModelMetadata(xml: string): ModelMetadata[] {
  const metas: ModelMetadata[] = [];
  const modelOpen = xml.match(/<model\b[^>]*>/i);
  if (!modelOpen) return metas;
  const after = xml.slice(xml.indexOf(modelOpen[0]) + modelOpen[0].length);
  const resourcesAt = after.search(/<resources[\s>]/i);
  const head = resourcesAt >= 0 ? after.slice(0, resourcesAt) : after;
  const startRe = /<metadata\b/gi;
  let start;
  while ((start = startRe.exec(head))) {
    const afterName = start.index + start[0].length;
    const rest = head.slice(afterName);
    const endAttrs = rest.search(/\/?>/);
    if (endAttrs < 0) break;
    const selfClose = rest[endAttrs] === "/";
    let cursor = afterName + endAttrs + (selfClose ? 2 : 1);
    let text = "";
    if (!selfClose) {
      const tail = head.slice(cursor);
      const closeAt = tail.search(/<\/metadata>/i);
      const nextMeta = tail.search(/<metadata\b/i);
      if (closeAt >= 0 && (nextMeta < 0 || closeAt < nextMeta)) {
        text = tail.slice(0, closeAt);
        cursor += closeAt + "</metadata>".length;
      }
    }
    startRe.lastIndex = cursor;
    metas.push({ attrs: parseAttrs(rest.slice(0, endAttrs)), text });
  }
  return metas;
}

type Component = { objectid: string; path: string | null; transform: string | null };
export type ModelObject = { id: string; body: string; hasMesh: boolean; components: Component[] };
export type SourceBuildItem = { objectid: string; transform: string | null; printable?: string; instanceId: number };

function extractComponents(body: string): Component[] {
  const comps: Component[] = [];
  const re = /<component\b([^>]*)\/?>/gi;
  let m;
  while ((m = re.exec(body))) {
    const attrs = parseAttrs(m[1]);
    comps.push({
      objectid: attrs.objectid,
      path: attrs["p:path"] || attrs.path || null,
      transform: attrs.transform || null,
    });
  }
  return comps;
}

export function extractObjects(xml: string): ModelObject[] {
  const objects: ModelObject[] = [];
  const re = /<object\b([^>]*)>([\s\S]*?)<\/object>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const body = m[2];
    objects.push({
      id: parseAttrs(m[1]).id,
      body,
      hasMesh: /<mesh[\s>]/i.test(body),
      components: extractComponents(body),
    });
  }
  return objects;
}

export function extractBuildItems(xml: string): SourceBuildItem[] {
  const items: SourceBuildItem[] = [];
  const instanceCount: Record<string, number> = {};
  const re = /<item\b([^>]*)\/?>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = parseAttrs(m[1]);
    if (!attrs.objectid) continue;
    const n = instanceCount[attrs.objectid] || 0;
    instanceCount[attrs.objectid] = n + 1;
    items.push({
      objectid: attrs.objectid,
      transform: attrs.transform || null,
      printable: attrs.printable,
      instanceId: n,
    });
  }
  return items;
}

export type ParsedModel = {
  objects: ModelObject[];
  buildItems: SourceBuildItem[];
  metadata: ModelMetadata[];
};

export type Resolved = {
  kind: "mesh" | "assembly";
  obj: ModelObject;
  filePath: string;
  objectId: string;
  transform: string | null;
};

export function getObject(
  parsedModels: Record<string, ParsedModel>,
  filePath: string,
  objectId: string,
): ModelObject | null {
  return parsedModels[pathKey(filePath)]?.objects.find((o) => String(o.id) === String(objectId)) ?? null;
}

/** Follows single-component wrappers down to a mesh, composing their transforms on the way. */
export function resolveTarget(
  parsedModels: Record<string, ParsedModel>,
  filePath: string,
  objectId: string,
  transform: string | null,
  seen: Set<string>,
): Resolved | null {
  const mark = `${pathKey(filePath)}::${objectId}`;
  if (seen.has(mark)) return null;
  seen.add(mark);
  const obj = getObject(parsedModels, filePath, objectId);
  if (!obj) return null;
  if (obj.hasMesh && obj.components.length === 0) return { kind: "mesh", obj, filePath, objectId, transform };
  if (!obj.hasMesh && obj.components.length === 1) {
    const c = obj.components[0];
    const childPath = c.path ? normalizePath(c.path) : filePath;
    return resolveTarget(
      parsedModels,
      childPath,
      c.objectid,
      formatTransform(multiplyTransform(transform, c.transform)),
      seen,
    );
  }
  return { kind: "assembly", obj, filePath, objectId, transform };
}
