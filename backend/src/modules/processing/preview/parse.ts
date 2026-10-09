import { listZipEntries, readZipEntry, walkZipEntries } from "../../../lib/zipReader";
import {
  COMPONENT_RE,
  ITEM_RE,
  OBJECT_RE,
  type FastMesh,
  applyAffineToVertices,
  extractMeshesFast,
  findPlateIdAttr,
  getAttr,
  parseTransform3MF,
} from "./meshes";
import { MAX_COMPONENT_DEPTH, type PartFileResolver, createPartFileResolver } from "./partFiles";
import { type StructuralData, parseModelSettingsConfig, parseProjectSettingsJson } from "./projectConfig";
import { countRenderedTriangles } from "./triangleBudget";

export type ObjectData = { id: string; meshes: FastMesh[]; plateId: number | null };
export type BuildItem = { objectId: string; transform: number[] | null; plateId: number | null };

type InternalComponentRef = { refId: string; transform: number[] | null; extruder: number };

async function parseMainModel(
  xml: string,
  structural: StructuralData,
  plateAssignmentsByName: Map<string, number>,
  partFiles: PartFileResolver,
): Promise<{ objects: Map<string, ObjectData>; buildItems: BuildItem[] }> {
  const objects = new Map<string, ObjectData>();
  // A <component> without p:path references another <object> in this document. Order isn't
  // guaranteed, so these are resolved in a second pass.
  const internalRefsByObjectId = new Map<string, InternalComponentRef[]>();

  OBJECT_RE.lastIndex = 0;
  let om: RegExpExecArray | null;
  while ((om = OBJECT_RE.exec(xml))) {
    const attrs = om[1];
    const inner = om[2];
    const objectId = getAttr(attrs, "id");
    if (!objectId) continue;

    const objectPlateId = findPlateIdAttr(attrs) ?? structural.plateAssignmentsByObjectId.get(objectId) ?? null;
    let defaultExtruder = structural.extruderMapById.get(objectId) ?? -1;
    if (defaultExtruder < 0) {
      const extruderAttr = getAttr(attrs, "p:extruder") ?? getAttr(attrs, "extruder") ?? "1";
      defaultExtruder = Math.max(0, parseInt(extruderAttr, 10) - 1);
    }

    const meshes = extractMeshesFast(inner, defaultExtruder);

    COMPONENT_RE.lastIndex = 0;
    let cm: RegExpExecArray | null;
    while ((cm = COMPONENT_RE.exec(inner))) {
      const cAttrs = cm[1];
      const extPath = getAttr(cAttrs, "p:path") ?? getAttr(cAttrs, "path");
      const compObjectId = getAttr(cAttrs, "objectid");
      const transform = parseTransform3MF(getAttr(cAttrs, "transform"));
      const partKey = compObjectId ? `${objectId}:${compObjectId}` : null;
      const compExtruder = partKey ? (structural.partExtruderMap.get(partKey) ?? defaultExtruder) : defaultExtruder;

      if (extPath) {
        for (const mesh of await partFiles.meshes(extPath, compObjectId)) {
          meshes.push({
            vertices: transform ? applyAffineToVertices(mesh.vertices, transform) : mesh.vertices,
            triangles: mesh.triangles,
            extruder: compExtruder,
          });
        }
      } else if (compObjectId) {
        if (!internalRefsByObjectId.has(objectId)) internalRefsByObjectId.set(objectId, []);
        internalRefsByObjectId.get(objectId)!.push({ refId: compObjectId, transform, extruder: compExtruder });
      }
    }

    // Keep pure wrapper objects too: they need an entry for the resolution pass.
    if (meshes.length > 0 || internalRefsByObjectId.has(objectId)) {
      objects.set(objectId, { id: objectId, meshes, plateId: objectPlateId });
    }
  }

  // A depth guard is enough against cyclic files; real wrapper chains are one level deep.
  const resolveInternalRefs = (objectId: string, depth: number): FastMesh[] => {
    const refs = internalRefsByObjectId.get(objectId);
    if (!refs || depth >= MAX_COMPONENT_DEPTH) return [];
    const resolved: FastMesh[] = [];
    for (const ref of refs) {
      const target = objects.get(ref.refId);
      if (!target) continue;
      const targetMeshes = [...target.meshes, ...resolveInternalRefs(ref.refId, depth + 1)];
      for (const mesh of targetMeshes) {
        resolved.push({
          vertices: ref.transform ? applyAffineToVertices(mesh.vertices, ref.transform) : mesh.vertices,
          triangles: mesh.triangles,
          extruder: ref.extruder,
        });
      }
    }
    return resolved;
  };
  // Resolve everything before appending, or nested references get counted twice per level.
  const resolvedByObjectId = new Map<string, FastMesh[]>();
  for (const objectId of internalRefsByObjectId.keys()) {
    resolvedByObjectId.set(objectId, resolveInternalRefs(objectId, 0));
  }
  for (const [objectId, resolved] of resolvedByObjectId) {
    const object = objects.get(objectId);
    if (object) for (const mesh of resolved) object.meshes.push(mesh);
  }

  const buildItems: BuildItem[] = [];
  const buildMatch = xml.match(/<build\b[\s\S]*?<\/build>/);
  if (buildMatch) {
    ITEM_RE.lastIndex = 0;
    let im: RegExpExecArray | null;
    while ((im = ITEM_RE.exec(buildMatch[0]))) {
      const attrs = im[1];
      const objectId = getAttr(attrs, "objectid");
      if (!objectId) continue;
      const transform = parseTransform3MF(getAttr(attrs, "transform"));
      const itemPlateId = findPlateIdAttr(attrs);
      const objectPlateId = objects.get(objectId)?.plateId ?? null;
      const objectName = structural.objectNameById.get(objectId);
      const namePlateId = objectName ? (plateAssignmentsByName.get(objectName) ?? null) : null;
      buildItems.push({ objectId, transform, plateId: itemPlateId ?? objectPlateId ?? namePlateId ?? null });
    }
  }

  return { objects, buildItems };
}

export type ParsedModel = {
  objects: Map<string, ObjectData>;
  buildItems: BuildItem[];
  plateNames: Map<number, string>;
  plateOffsets: Map<number, { offsetX: number; offsetY: number }>;
  plateThumbnails: Map<number, string>;
  filamentColors: string[];
  buildVolume: { x: number; y: number };
};

const MAIN_MODEL_PATH = "3D/3dmodel.model";
// Counted after expanding components and placements: a Bambu file's main model has almost none.
const MAX_TRIANGLES = 8_000_000;
// V8 can't hold a string past ~512MB. Checked from the zip's central directory before inflating.
const MAX_MODEL_ENTRY_BYTES = 500 * 1024 * 1024;
const MAX_MODEL_TOTAL_BYTES = 1024 * 1024 * 1024;

/** "too-complex" is over budget (the browser mustn't try either); "unsupported" is a layout this
 * parser doesn't handle, which the browser's loaders may still manage. */
export type PreviewRefusal = "too-complex" | "unsupported";

export async function parseThreeMfFast(srcPath: string): Promise<ParsedModel | PreviewRefusal> {
  const modelEntries = (await listZipEntries(srcPath)).filter(
    (entry) => !entry.isDirectory && entry.name.toLowerCase().endsWith(".model"),
  );
  if (!modelEntries.some((entry) => entry.name === MAIN_MODEL_PATH)) return "unsupported";
  if (modelEntries.some((entry) => entry.size > MAX_MODEL_ENTRY_BYTES)) return "too-complex";
  if (modelEntries.reduce((sum, entry) => sum + entry.size, 0) > MAX_MODEL_TOTAL_BYTES) return "too-complex";

  let modelSettingsText: string | null = null;
  let projectSettingsText: string | null = null;
  let mainModelText: string | null = null;
  const plateJsonEntries: { plateIndex: number; text: string }[] = [];
  const plateThumbBytes = new Map<number, Buffer>();

  await walkZipEntries(
    srcPath,
    (entry) => {
      if (entry.name === "Metadata/model_settings.config") return true;
      if (entry.name === "Metadata/project_settings.config") return true;
      if (entry.name === MAIN_MODEL_PATH) return true;
      if (/^Metadata\/plate_\d+\.json$/.test(entry.name)) return true;
      if (/^Metadata\/(plate|top)_\d+\.png$/.test(entry.name)) return true;
      return false;
    },
    async (entry, stream) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(chunk);
      const buf = Buffer.concat(chunks);

      if (entry.name === "Metadata/model_settings.config") modelSettingsText = buf.toString("utf-8");
      else if (entry.name === "Metadata/project_settings.config") projectSettingsText = buf.toString("utf-8");
      else if (entry.name === MAIN_MODEL_PATH) mainModelText = buf.toString("utf-8");
      else {
        const plateMatch = entry.name.match(/^Metadata\/plate_(\d+)\.json$/);
        if (plateMatch)
          plateJsonEntries.push({ plateIndex: Number.parseInt(plateMatch[1], 10), text: buf.toString("utf-8") });
        const thumbMatch = entry.name.match(/^Metadata\/(?:plate|top)_(\d+)\.png$/);
        if (thumbMatch) {
          const idx = Number.parseInt(thumbMatch[1], 10);
          // "plate_N" takes priority over "top_N".
          if (!plateThumbBytes.has(idx)) plateThumbBytes.set(idx, buf);
        }
      }
    },
  );

  if (!mainModelText) return "unsupported";
  const mainModelXml: string = mainModelText;

  const structural = modelSettingsText ? parseModelSettingsConfig(modelSettingsText) : parseModelSettingsConfig("");
  const { filamentColors, buildVolume } = projectSettingsText
    ? parseProjectSettingsJson(projectSettingsText)
    : { filamentColors: [], buildVolume: null };

  // Fallback for files MakerWorld didn't slice: plate_N.json keyed by object name.
  const plateAssignmentsByName = new Map<string, number>();
  for (const { plateIndex, text } of plateJsonEntries) {
    try {
      const json = JSON.parse(text) as { bbox_objects?: { name?: string }[] };
      for (const entry of json.bbox_objects ?? []) {
        if (entry?.name) plateAssignmentsByName.set(entry.name, plateIndex);
      }
    } catch {}
  }

  const externalModelCache = new Map<string, string | null>();
  const loadExternalModel = async (rawPath: string): Promise<string | null> => {
    const normalized = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;
    if (externalModelCache.has(normalized)) return externalModelCache.get(normalized) ?? null;
    const buf = await readZipEntry(srcPath, normalized, MAX_MODEL_ENTRY_BYTES);
    const text = buf ? buf.toString("utf-8") : null;
    externalModelCache.set(normalized, text);
    return text;
  };

  // Before any geometry is allocated, so an over-budget file fails cheaply.
  const partFiles = createPartFileResolver(loadExternalModel);
  if ((await countRenderedTriangles(mainModelXml, partFiles)) > MAX_TRIANGLES) return "too-complex";

  const { objects, buildItems } = await parseMainModel(mainModelXml, structural, plateAssignmentsByName, partFiles);
  if (objects.size === 0) return "unsupported";

  const plateThumbnails = new Map<number, string>();
  for (const [idx, bytes] of plateThumbBytes) {
    plateThumbnails.set(idx, `data:image/png;base64,${bytes.toString("base64")}`);
  }

  return {
    objects,
    buildItems,
    plateNames: structural.plateNames,
    plateOffsets: structural.plateOffsets,
    plateThumbnails,
    filamentColors,
    buildVolume: buildVolume ?? { x: 256, y: 256 },
  };
}
