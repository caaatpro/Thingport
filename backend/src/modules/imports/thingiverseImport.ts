import path from "node:path";
import { HttpError } from "../../http/errors";
import { getThingiverseAccessToken } from "../system/index";
import { upsertAuthorFromImport } from "../library/index";
import { resolveThingiverseThing, ThingiverseAuthError, ThingiverseRateLimitError } from "./providers/thingiverse";
import { buildPrintMeta, createImportedPrint } from "./createImportedPrint";
import { downloadPlainFiles, MULTI_FILE_PLATE_EXTS, removeTempFiles } from "./download";
import type { SourceModel } from "./sourceLinks";
import type { ImportedPrint, ImportRequestBody } from "./types";

export const THINGIVERSE_NOT_CONFIGURED =
  "Thingiverse import isn't configured for this instance yet -- ask an admin to add an Access Token in Admin Settings.";

/** The instance's Thingiverse token, or the 503 users see when an admin hasn't added one yet. */
export async function requireThingiverseAccessToken(): Promise<string> {
  const accessToken = await getThingiverseAccessToken();
  if (!accessToken) throw new HttpError(503, THINGIVERSE_NOT_CONFIGURED);
  return accessToken;
}

/** Every model file bundled with the Thing becomes its own Plate on one Print. */
export async function importThingiverseThing(
  userId: string,
  source: SourceModel,
  body: ImportRequestBody,
): Promise<ImportedPrint> {
  const accessToken = await requireThingiverseAccessToken();

  let resolved;
  try {
    resolved = await resolveThingiverseThing(source.externalId, accessToken);
  } catch (err) {
    if (err instanceof ThingiverseRateLimitError) throw new HttpError(429, err.message);
    // 400, not 401: the frontend treats any 401 as an expired Thingport session and logs out.
    if (err instanceof ThingiverseAuthError) throw new HttpError(400, err.message);
    throw err;
  }
  if (!resolved) {
    throw new HttpError(
      404,
      "This Thingiverse Thing could not be found, or isn't accessible with the configured Access Token.",
    );
  }
  const { meta, plateFiles, galleryImages } = resolved;

  const author = await upsertAuthorFromImport(meta.author ?? null);
  const printMeta = await buildPrintMeta(userId, body, meta, author, source);

  const modelFiles = plateFiles.filter((f) => MULTI_FILE_PLATE_EXTS.has(path.extname(f.name).toLowerCase()));
  const { inputs: downloaded, rateLimited } = await downloadPlainFiles(modelFiles);
  if (!downloaded.length) {
    if (rateLimited) {
      throw new HttpError(
        429,
        "Thingiverse blocked a file download with a rate-limit challenge (Cloudflare). This usually clears after a while -- wait, then retry the same import.",
      );
    }
    throw new HttpError(400, "None of this Thing's files could be downloaded.");
  }

  try {
    return await createImportedPrint(
      userId,
      source,
      printMeta,
      meta.title || `thing-${source.externalId}`,
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
