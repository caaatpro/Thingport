import { applyTriangleMaterials } from "./paint";
import { type Part, mergePartsToMesh } from "./mergeParts";
import {
  type ObjectMeta,
  type ObjectSettings,
  type OutBuildItem,
  type PartSettings,
  type PlateSettings,
  type Volume,
  assignInstancesToPlates,
} from "./modelSettings";
import {
  NO_MODEL,
  type ParsedModel,
  type Resolved,
  type SourceBuildItem,
  getObject,
  resolveTarget,
} from "./modelParse";
import { type Settings, asArray, slic3rSerialize } from "./settings";
import { IDENTITY, formatTransform, multiplyTransform } from "./transform";
import { countOccurrences, escapeXml, normalizePath, pathKey } from "./xml";

// Flattens the parsed production-extension parts into the single core 3MF model: one mesh per build
// item, every triangle pointing at a basematerial for its filament.

const CORE_NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";

const KEEP_META_NAMES = new Set([
  "Title",
  "Description",
  "Designer",
  "Copyright",
  "License",
  "CreationDate",
  "ModificationDate",
]);

function formatCoreMetadata(name: string, text: string): string {
  const value = text.trim();
  if (!value) return ` <metadata name="${escapeXml(name)}" />`;
  return ` <metadata name="${escapeXml(name)}">${escapeXml(value)}</metadata>`;
}

function displayColor(hex: unknown): string {
  const raw = String(hex || "#808080").replace(/^#/, "");
  if (raw.length === 8) return `#${raw.toUpperCase()}`;
  if (raw.length === 6) return `#${raw.toUpperCase()}FF`;
  return "#808080FF";
}

function buildBasematerialsXml(id: number, colors: unknown[], types: unknown[]): string {
  const palette = colors.length ? colors : ["#808080"];
  const names = colors.length ? types : ["Filament"];
  const bases = palette
    .map(
      (c, i) => `  <base name="${escapeXml(`${names[i] || "Filament"} ${i + 1}`)}" displaycolor="${displayColor(c)}"/>`,
    )
    .join("\n");
  return `<basematerials id="${id}">\n${bases}\n </basematerials>`;
}

type FlattenInput = {
  parsedModels: Record<string, ParsedModel>;
  rootPath: string;
  modelSettings: Record<string, ObjectSettings>;
  bambuSettings: Settings;
  mappedSettings: Settings;
  plates: PlateSettings[];
};

type EmittedMesh = { id: number; body: string; extruder: number; merged?: boolean };

function partInfo(wrapper: Partial<ObjectSettings>, componentObjectId: string, componentIndex: number): PartSettings {
  const parts = wrapper.parts || [];
  return (
    parts.find((p) => String(p.id) === String(componentObjectId)) ||
    parts[componentIndex] || { name: wrapper.name || "", extruder: wrapper.extruder || 1 }
  );
}

export function buildFlattenedModel({
  parsedModels,
  rootPath,
  modelSettings,
  bambuSettings,
  mappedSettings,
  plates,
}: FlattenInput) {
  const root = parsedModels[pathKey(rootPath)];
  if (!root) throw new Error(NO_MODEL);

  const colors = asArray(bambuSettings.filament_colour);
  const types = asArray(bambuSettings.filament_type);
  const materialsId = 1;
  let nextId = 2;

  const meshKeyToId = new Map<string, { id: number; extruder: number }>();
  const emittedMeshes: EmittedMesh[] = [];
  const buildItems: OutBuildItem[] = [];
  const objectMeta: ObjectMeta[] = [];

  // A shared mesh used with a different extruder is cloned, since the filament lives on the object.
  function ensureMesh(filePath: string, objectId: string, extruder: number): number | null {
    const key = `${pathKey(filePath)}::${objectId}`;
    const src = getObject(parsedModels, filePath, objectId);
    const existing = meshKeyToId.get(key);
    if (existing) {
      if (existing.extruder && extruder && existing.extruder !== extruder && src) {
        const cloneId = nextId++;
        emittedMeshes.push({ id: cloneId, body: src.body, extruder });
        return cloneId;
      }
      return existing.id;
    }
    if (!src || !src.hasMesh) return null;
    const id = nextId++;
    meshKeyToId.set(key, { id, extruder });
    emittedMeshes.push({ id, body: src.body, extruder });
    return id;
  }

  function rememberObjectMeta(id: number, name: string, extruder: number, volumes: Volume[]) {
    if (!objectMeta.some((o) => o.id === id)) objectMeta.push({ id, name, extruder, volumes });
  }

  function gatherParts(node: Resolved | null, wrapper: Partial<ObjectSettings>, localTransform: string): Part[] {
    if (!node) return [];
    if (node.kind === "mesh") {
      return [{ name: wrapper.name || "", extruder: wrapper.extruder || 1, body: node.obj.body, localTransform }];
    }
    const out: Part[] = [];
    node.obj.components.forEach((c, index) => {
      const info = partInfo(wrapper, c.objectid, index);
      const childPath = c.path ? normalizePath(c.path) : node.filePath;
      const childLocal = formatTransform(multiplyTransform(localTransform, c.transform));
      const child = resolveTarget(parsedModels, childPath, c.objectid, c.transform, new Set());
      out.push(...gatherParts(child, { name: info.name, extruder: info.extruder, parts: [] }, childLocal));
    });
    return out;
  }

  const items: SourceBuildItem[] = root.buildItems.length
    ? root.buildItems
    : root.objects.map((o) => ({ objectid: o.id, transform: null, printable: "1", instanceId: 0 }));
  if (!items.length) throw new Error(NO_MODEL);

  for (const item of items) {
    const wrapper: Partial<ObjectSettings> = modelSettings[String(item.objectid)] || {};
    const resolved = resolveTarget(parsedModels, rootPath, item.objectid, item.transform, new Set());
    if (!resolved) continue;
    const printable = item.printable ?? "1";
    const source = { sourceObjectId: String(item.objectid), sourceInstanceId: item.instanceId };
    if (resolved.kind === "mesh") {
      const extruder = wrapper.extruder || 1;
      const newId = ensureMesh(resolved.filePath, resolved.objectId, extruder);
      if (!newId) continue;
      buildItems.push({ objectid: newId, transform: resolved.transform, printable, ...source });
      rememberObjectMeta(newId, wrapper.name || "", extruder, []);
      continue;
    }
    const parts = gatherParts(resolved, wrapper, IDENTITY);
    if (!parts.length) continue;
    const merged = mergePartsToMesh(parts, materialsId, colors);
    const id = nextId++;
    const extruder = wrapper.extruder || parts[0].extruder;
    emittedMeshes.push({ id, body: merged.body, extruder, merged: true });
    buildItems.push({ objectid: id, transform: item.transform, printable, ...source });
    rememberObjectMeta(id, wrapper.name || parts[0].name || "", extruder, merged.volumes);
  }

  if (!emittedMeshes.length) throw new Error(NO_MODEL);

  const metadataXml: string[] = [];
  for (const meta of root.metadata) {
    const name = meta.attrs.name;
    if (name && KEEP_META_NAMES.has(name)) metadataXml.push(formatCoreMetadata(name, meta.text));
  }
  metadataXml.push(` <metadata name="Application">Thingport</metadata>`);
  for (const [key, value] of Object.entries(mappedSettings)) {
    metadataXml.push(` <metadata name="slic3r:${escapeXml(key)}">${escapeXml(slic3rSerialize(value))}</metadata>`);
  }

  const pindexFor = (extruder: number) =>
    colors.length ? Math.min(Math.max(0, (extruder || 1) - 1), colors.length - 1) : 0;

  const buildXml = buildItems
    .map((item) => {
      const t = item.transform ? ` transform="${item.transform}"` : "";
      return `  <item objectid="${item.objectid}"${t} printable="${item.printable}"/>`;
    })
    .join("\n");

  const stats = {
    objects: emittedMeshes.length,
    buildItems: buildItems.length,
    plates: 0,
    vertices: 0,
    triangles: 0,
    paintColors: 0,
    materials: colors.length || 1,
  };

  // One object at a time: a large project's whole model is past V8's ~512 MB string limit. The
  // geometry counts in `stats` are filled in as it's consumed.
  function* modelXml(): Generator<string> {
    yield [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<model unit="millimeter" xml:lang="en-US" xmlns="${CORE_NS}" xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">`,
      metadataXml.join("\n"),
      " <resources>",
      ` ${buildBasematerialsXml(materialsId, colors, types)}`,
    ].join("\n");
    for (const mesh of emittedMeshes) {
      const body = mesh.merged
        ? mesh.body
        : applyTriangleMaterials(
            mesh.body.replace(/<component\b[^>]*\/?>/gi, "").replace(/p:[\w.-]+\s*=\s*"[^"]*"\s*/g, ""),
            materialsId,
            mesh.extruder,
            colors.length,
          );
      stats.vertices += countOccurrences(body, "<vertex ");
      stats.triangles += countOccurrences(body, "<triangle ");
      stats.paintColors += countOccurrences(body, 'paint_color="');
      yield `\n <object id="${mesh.id}" type="model" pid="${materialsId}" pindex="${pindexFor(mesh.extruder)}">${body}</object>`;
    }
    yield ["", " </resources>", " <build>", buildXml, " </build>", "</model>", ""].join("\n");
  }

  const instanceCount: Record<number, number> = {};
  for (const item of buildItems) {
    const n = instanceCount[item.objectid] || 0;
    item.outInstanceId = n;
    instanceCount[item.objectid] = n + 1;
  }
  const assignedPlates = assignInstancesToPlates(plates, buildItems);

  stats.plates = assignedPlates.length;

  return { modelXml, objectMeta, plates: assignedPlates, assembleItems: buildItems, stats };
}
