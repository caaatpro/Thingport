import path from "node:path";
import { guessMimeFromPath } from "../../lib/files";
import { cults3dMetaFromExtension } from "./providers/cults3d";
import { upsertAuthorFromImport } from "../library/index";
import type { NewPlateInput } from "../prints/index";
import { buildPrintMeta, createImportedPrint } from "./createImportedPrint";
import { downloadImportToTemp, removeTempFiles } from "./download";
import { downloadCults3dFiles, unpackZipToPlateInputs } from "./cults3dFiles";
import { findExistingImportedPrint } from "./importedPrints";
import { addMakerworldProfileToPrint } from "./makerworldProfiles";
import { importPrintablesModel } from "./printablesImport";
import { identifySourceModel, type SourceModel } from "./sourceLinks";
import { importThingiverseThing } from "./thingiverseImport";
import type { ImportedPageMetadata, ImportedPrint, ImportRequestBody } from "./types";

/**
 * A model from an arbitrary link (or MakerWorld / Cults3D, which are resolved page by page): downloads
 * the file and creates the Print. Cults3D zips and multi-file orders become one plate per model file.
 */
async function importFromLink(
  userId: string,
  url: string,
  source: SourceModel | null,
  body: ImportRequestBody,
): Promise<ImportedPrint> {
  const unpackedTemps: string[] = [];
  // Cults3D: the extension sends one link per file of the order; each file is a plate of one Print.
  const cultsFiles = source?.provider === "cults3d" && body.resolved_files?.length ? body.resolved_files : null;
  let cultsInputs: NewPlateInput[] = [];
  let tempPath: string, filename: string, mime: string, meta: ImportedPageMetadata;
  if (cultsFiles) {
    cultsInputs = await downloadCults3dFiles(url, body, cultsFiles, unpackedTemps);
    const first = cultsInputs[0];
    tempPath = first.tempFilePath ?? "";
    filename = first.filename;
    mime = first.mime ?? guessMimeFromPath(first.filename);
    meta = cults3dMetaFromExtension(body.page_meta);
  } else {
    ({ tempPath, filename, mime, meta } = await downloadImportToTemp(url, body));
  }
  const author = await upsertAuthorFromImport(meta.author);
  const printMeta = await buildPrintMeta(userId, body, meta, author, source);

  try {
    // Cults3D ships most models as a zip of STLs: every model file becomes a plate of one Print.
    const unpacked = cultsFiles
      ? cultsInputs
      : source?.provider === "cults3d" && path.extname(filename).toLowerCase() === ".zip"
        ? await unpackZipToPlateInputs(tempPath, unpackedTemps)
        : [];
    return await createImportedPrint(
      userId,
      source,
      printMeta,
      path.parse(filename).name,
      unpacked.length
        ? unpacked
        : [{ filename, mime, tempFilePath: tempPath, sourceInstanceId: meta.makerworldProfile?.instanceId ?? null }],
      author,
      { cover: meta.previewImageUrl, gallery: meta.galleryImages, paceMs: body.makerworldPaceMs },
    );
  } finally {
    await removeTempFiles([tempPath, ...unpackedTemps]);
  }
}

/** Returns the existing print with `alreadyImported: true` instead of re-downloading a model
 * this user already imported. */
export async function importPrintFromUrl(userId: string, url: string, body: ImportRequestBody): Promise<ImportedPrint> {
  const source = identifySourceModel(url);
  if (source) {
    const existing = await findExistingImportedPrint(userId, source);
    if (existing && source.provider === "makerworld") return addMakerworldProfileToPrint(existing, url, body);
    if (existing) return { ...existing, alreadyImported: true };
  }

  if (source?.provider === "thingiverse") return importThingiverseThing(userId, source, body);
  if (source?.provider === "printables") return importPrintablesModel(userId, source, body);
  return importFromLink(userId, url, source, body);
}
