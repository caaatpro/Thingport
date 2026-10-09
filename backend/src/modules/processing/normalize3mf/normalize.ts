import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import JSZip from "jszip";
import { buildFlattenedModel } from "./flatten";
import { NO_MODEL, extractBuildItems, extractModelMetadata, extractObjects, type ParsedModel } from "./modelParse";
import {
  type ObjectSettings,
  type PlateSettings,
  buildModelSettingsConfig,
  buildSlic3rModelConfig,
  parseModelSettings,
  parsePlates,
} from "./modelSettings";
import {
  type Settings,
  buildSlic3rConfig,
  extractBambuSettings,
  mapSettingsToSlic3r,
  normalizeProjectSettings,
} from "./settings";
import { contentTypesXml, indexZipFiles, relsXml, shouldDropEntry } from "./zipPackage";

// Flattens a Bambu/Orca production-extension 3MF into core 3MF that PrusaSlicer, Cura and Anycubic
// import correctly, keeping painted colors, filament colors and the designer's process settings.

type NormalizeReport = {
  settings: Settings;
  projectKeys: string[];
  objects: number;
  buildItems: number;
  plates: number;
  vertices: number;
  triangles: number;
  paintColors: number;
  materials: number;
  flattened: boolean;
};

async function buildNormalizedZip(input: Buffer | Uint8Array): Promise<{ out: JSZip; report: () => NormalizeReport }> {
  const zip = await JSZip.loadAsync(input);
  const filesByKey = indexZipFiles(zip);
  const rootRec = filesByKey["3d/3dmodel.model"];
  if (!rootRec) throw new Error(NO_MODEL);

  let bambuSettings: Settings = {};
  const projectRec = filesByKey["metadata/project_settings.config"];
  if (projectRec) {
    try {
      bambuSettings = extractBambuSettings(JSON.parse(await projectRec.entry.async("string")));
    } catch {}
  }

  let modelSettings: Record<string, ObjectSettings> = {};
  let plates: PlateSettings[] = [];
  const modelSetRec = filesByKey["metadata/model_settings.config"];
  if (modelSetRec) {
    const modelXml = await modelSetRec.entry.async("string");
    modelSettings = parseModelSettings(modelXml);
    plates = parsePlates(modelXml);
  }

  const modelXmlByKey: Record<string, string> = {};
  for (const [key, rec] of Object.entries(filesByKey)) {
    if (key.endsWith(".model")) modelXmlByKey[key] = await rec.entry.async("string");
  }
  const parsedModels: Record<string, ParsedModel> = {};
  for (const [key, xml] of Object.entries(modelXmlByKey)) {
    parsedModels[key] = {
      objects: extractObjects(xml),
      buildItems: extractBuildItems(xml),
      metadata: extractModelMetadata(xml),
    };
  }

  const mappedSettings = mapSettingsToSlic3r(bambuSettings);
  const flattened = buildFlattenedModel({
    parsedModels,
    rootPath: rootRec.relativePath,
    modelSettings,
    bambuSettings,
    mappedSettings,
    plates,
  });
  const hadProduction =
    Object.keys(modelXmlByKey).some((p) => /objects\/object_/i.test(p)) ||
    /requiredextensions\s*=\s*"p"/i.test(modelXmlByKey["3d/3dmodel.model"] || "");

  const out = new JSZip();
  out.file("[Content_Types].xml", contentTypesXml());

  const thumbRec =
    filesByKey["metadata/plate_1.png"] || filesByKey["metadata/thumbnail.png"] || filesByKey["metadata/top_1.png"];
  if (thumbRec) out.file("Metadata/thumbnail.png", await thumbRec.entry.async("uint8array"));
  out.file("_rels/.rels", relsXml(Boolean(thumbRec)));
  out.file("3D/3dmodel.model", Readable.from(flattened.modelXml(), { objectMode: false }));

  const cleanedProject = normalizeProjectSettings(bambuSettings);
  if (Object.keys(cleanedProject).length) {
    out.file("Metadata/project_settings.config", JSON.stringify(cleanedProject, null, 2));
  }
  if (Object.keys(mappedSettings).length) out.file("Metadata/Slic3r_PE.config", buildSlic3rConfig(mappedSettings));
  if (flattened.objectMeta.length) {
    out.file("Metadata/Slic3r_PE_model.config", buildSlic3rModelConfig(flattened.objectMeta));
    out.file(
      "Metadata/model_settings.config",
      buildModelSettingsConfig(flattened.objectMeta, flattened.plates, flattened.assembleItems),
    );
  }

  for (const [key, rec] of Object.entries(filesByKey)) {
    if (shouldDropEntry(rec.relativePath)) continue;
    if (key === "metadata/thumbnail.png" && thumbRec) continue;
    out.file(rec.relativePath, await rec.entry.async("uint8array"));
  }

  return {
    out,
    // Geometry counts are only complete once the zip has been generated.
    report: () => ({
      settings: mappedSettings,
      projectKeys: Object.keys(cleanedProject).toSorted(),
      ...flattened.stats,
      flattened: hadProduction,
    }),
  };
}

const ZIP_OPTIONS = { compression: "DEFLATE", compressionOptions: { level: 6 } } as const;

export async function normalize3mf(
  input: Buffer | Uint8Array,
): Promise<{ bytes: Uint8Array; report: NormalizeReport }> {
  const { out, report } = await buildNormalizedZip(input);
  const bytes = await out.generateAsync({ type: "uint8array", ...ZIP_OPTIONS });
  return { bytes, report: report() };
}

/** Streams the result to `destPath`, so a large project is never held in memory as one zip. */
export async function writeNormalized3mf(input: Buffer | Uint8Array, destPath: string): Promise<NormalizeReport> {
  const { out, report } = await buildNormalizedZip(input);
  await pipeline(
    out.generateNodeStream({ type: "nodebuffer", streamFiles: true, ...ZIP_OPTIONS }),
    createWriteStream(destPath),
  );
  return report();
}
