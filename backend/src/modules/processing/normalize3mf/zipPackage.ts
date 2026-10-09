import type JSZip from "jszip";
import { pathKey } from "./xml";

// The package-level parts of the output 3MF (content types, relationships) and which source entries survive.

const MODEL_REL = "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel";
const THUMB_REL = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail";

/** Entries rebuilt from scratch or that only Bambu reads (sliced G-code, plate caches, split objects). */
export function shouldDropEntry(relativePath: string): boolean {
  const p = pathKey(relativePath);
  if (p.includes(".gcode") || p.includes("slice_info") || p.includes("custom_gcode")) return true;
  if (p.startsWith("3d/objects/") || p.startsWith("3d/_rels/")) return true;
  if (p.startsWith("auxiliaries/") || p.startsWith("metadata/_rels/")) return true;
  if (p.includes("filament_settings") || p.includes("filament_sequence") || p.includes("cut_information")) return true;
  if (/plate_\d+\.json$/.test(p)) return true;
  if (p.endsWith("metadata/project_settings.config") || p.endsWith("metadata/model_settings.config")) return true;
  return p === "[content_types].xml" || p === "_rels/.rels" || p === "3d/3dmodel.model";
}

export type ZipRecord = { relativePath: string; entry: JSZip.JSZipObject };

export function indexZipFiles(zip: JSZip): Record<string, ZipRecord> {
  const filesByKey: Record<string, ZipRecord> = {};
  for (const [relativePath, entry] of Object.entries(zip.files)) {
    if (!entry.dir) filesByKey[pathKey(relativePath)] = { relativePath, entry };
  }
  return filesByKey;
}

export function contentTypesXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>',
    ' <Default Extension="png" ContentType="image/png"/>',
    ' <Default Extension="config" ContentType="application/octet-stream"/>',
    "</Types>",
    "",
  ].join("\n");
}

export function relsXml(hasThumbnail: boolean): string {
  const rels = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ` <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="${MODEL_REL}"/>`,
  ];
  if (hasThumbnail) rels.push(` <Relationship Target="/Metadata/thumbnail.png" Id="rel-2" Type="${THUMB_REL}"/>`);
  rels.push("</Relationships>", "");
  return rels.join("\n");
}
