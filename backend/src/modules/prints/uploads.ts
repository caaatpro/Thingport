import fs from "node:fs/promises";
import path from "node:path";
import { RENDERABLE_MODEL_EXTS } from "../../config";
import { badRequest } from "../../http/errors";
import { mimeFromContentType, sanitizeFilename } from "../../utils/fileUtils";
import { createLog } from "../../services/auditLog";
import { addPrintsToCollection, systemCollectionKeyForId } from "../../services/collectionService";
import { requireCollectionRole } from "./access";
import type { PrintOut } from "./dto";
import { toPrintOut } from "./dto";
import { createPrint, type NewPlateInput } from "./printCreation";
import { saveFileFromTemp } from "./printFiles";
import { printOutById } from "./printLoader";
import type { UploadForm } from "./schemas";

/** What the upload middleware leaves for each file: a temporary file on disk plus the client's metadata. */
export type UploadedFile = { path: string; originalname: string; mimetype: string };

export function toPlateInput(file: UploadedFile): NewPlateInput {
  const safeName = sanitizeFilename(file.originalname);
  return { filename: safeName, mime: mimeFromContentType(file.mimetype, safeName), tempFilePath: file.path };
}

/** Upload middleware writes to disk; whatever a request didn't move into storage is deleted afterwards. */
export async function removeTempFiles(files: UploadedFile[]): Promise<void> {
  await Promise.all(files.map((f) => fs.rm(f.path, { force: true })));
}

function isRenderable(file: UploadedFile): boolean {
  return RENDERABLE_MODEL_EXTS.has(path.extname(file.originalname).toLowerCase());
}

function logUpload(userId: string, print: { id: string; name: string }): void {
  void createLog({ userId, action: "model_uploaded", targetId: print.id, details: { name: print.name } });
}

/**
 * Creates models from uploaded files: one per file ("separate"), or one multi-plate model ("multiplate"),
 * optionally straight into a collection the user may upload to.
 */
export async function uploadModels(userId: string, files: UploadedFile[], form: UploadForm): Promise<PrintOut[]> {
  if (!files.length) throw badRequest("No files uploaded");
  const mode = form.mode === "multiplate" ? "multiplate" : "separate";
  if (files.length > 1 && form.mode !== "separate" && form.mode !== "multiplate") {
    throw badRequest("mode is required when uploading more than one file");
  }
  // Uploading into a collection shared with you (UPLOAD role or better) stores the model under the
  // collection's owner, who then owns everything in it.
  const targetCollection =
    form.collection_id && !systemCollectionKeyForId(form.collection_id)
      ? await requireCollectionRole(userId, form.collection_id, "UPLOAD")
      : null;
  const ownerId = targetCollection?.collection.userId ?? userId;
  const meta = {
    title: form.title || null,
    notes: form.notes || null,
    tags: form.tags,
    categoryId: ownerId === userId ? form.category_id || null : null,
  };

  const printsOut: PrintOut[] = [];
  if (files.length === 1 || mode === "separate") {
    for (const file of files) {
      const plate = toPlateInput(file);
      const { print, plates } = await createPrint(ownerId, meta, path.parse(plate.filename).name, [plate]);
      printsOut.push(toPrintOut(print, plates, [], null));
      logUpload(userId, print);
    }
  } else {
    // Non-renderable files become SUPPORTING files. If nothing is renderable, every file becomes a
    // plate so the print still has one.
    const renderable = files.filter(isRenderable);
    const supporting = renderable.length ? files.filter((f) => !isRenderable(f)) : [];
    const plateInputs = (renderable.length ? renderable : files).map(toPlateInput);
    const { print } = await createPrint(ownerId, meta, path.parse(plateInputs[0].filename).name, plateInputs);
    for (const f of supporting) {
      await saveFileFromTemp(ownerId, print.id, f.path, f.originalname, f.mimetype);
    }
    printsOut.push(await printOutById(ownerId, print.id));
    logUpload(userId, print);
  }
  // Collection-aware upload (drag & drop onto a collection page). Real collections only.
  if (targetCollection && printsOut.length) {
    await addPrintsToCollection(
      targetCollection.collection.id,
      printsOut.map((p) => p.id),
    );
  }
  return printsOut;
}
