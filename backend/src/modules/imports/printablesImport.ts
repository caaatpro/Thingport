import path from "node:path";
import { HttpError } from "../../http/errors";
import { upsertAuthorFromImport } from "../library/index";
import {
  resolvePrintablesDownloadLinks,
  resolvePrintablesModel,
  type PrintablesPlateFile,
} from "./providers/printables";
import { buildPrintMeta, createImportedPrint } from "./createImportedPrint";
import { downloadPlainFiles, MULTI_FILE_PLATE_EXTS, removeTempFiles } from "./download";
import type { SourceModel } from "./sourceLinks";
import type { ImportedPrint, ImportRequestBody } from "./types";

export async function importPrintablesModel(
  userId: string,
  source: SourceModel,
  body: ImportRequestBody,
): Promise<ImportedPrint> {
  const resolved = await resolvePrintablesModel(source.externalId);
  if (!resolved) {
    throw new HttpError(404, "This Printables model could not be found, or isn't public.");
  }
  const { meta, plateFiles, galleryImages } = resolved;

  const modelFiles = plateFiles.filter((f: PrintablesPlateFile) =>
    MULTI_FILE_PLATE_EXTS.has(path.extname(f.name).toLowerCase()),
  );
  if (!modelFiles.length) {
    throw new HttpError(
      400,
      "This Printables model has no downloadable model files (only sliced/print-ready files, if any).",
    );
  }
  const downloadLinks = await resolvePrintablesDownloadLinks(
    source.externalId,
    modelFiles.map((f) => f.id),
  );
  const linked = modelFiles.flatMap((file) => {
    const url = downloadLinks.get(file.id);
    return url ? [{ url, name: file.name }] : [];
  });
  const { inputs: downloaded } = await downloadPlainFiles(linked);
  if (!downloaded.length) {
    throw new HttpError(400, "None of this model's files could be downloaded.");
  }

  const author = await upsertAuthorFromImport(meta.author ?? null);
  const printMeta = await buildPrintMeta(userId, body, meta, author, source);

  try {
    return await createImportedPrint(
      userId,
      source,
      printMeta,
      meta.title || `printables-${source.externalId}`,
      downloaded,
      author,
      {
        cover: meta.previewImageUrl ?? null,
        gallery: galleryImages.map((img) => ({ url: img.url, filename: img.name })),
      },
    );
  } finally {
    await removeTempFiles(downloaded.flatMap((input) => (input.tempFilePath ? [input.tempFilePath] : [])));
  }
}
