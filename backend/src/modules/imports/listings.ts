import { IMPORT_MAKERWORLD_CALL_DELAY_MS } from "../../config";
import { HttpError } from "../../http/errors";
import { normalizeImportUrl } from "../../lib/url";
import { extractMakerworldBearerToken } from "./providers/makerworld/urls";
import { MakerworldAuthError, MakerworldCaptchaError } from "./providers/makerworld/captcha";
import { fetchMakerworldCollectionEntries, fetchMakerworldCollectionTitle } from "./providers/makerworld/collections";
import { parseMakerworldCollectionUrl } from "./providers/makerworld/urls";
import {
  fetchThingiverseCollectionThings,
  fetchThingiverseCollectionTitle,
  fetchThingiverseUserLikes,
  parseThingiverseCollectionUrl,
  parseThingiverseLikesUrl,
} from "./providers/thingiverse";
import { fetchPrintablesCollectionEntries, parsePrintablesCollectionUrl } from "./providers/printables";
import { resolveMakerworldCookie, withStoredMakerworldCookie } from "./cookies";
import { findImportedExternalIds } from "./importedPrints";
import type { ImportRequest } from "./schemas";
import { requireThingiverseAccessToken } from "./thingiverseImport";

// Listings of what a provider collection holds, shown before the user picks what to import.

type RawEntry = { id: string; title: string; cover: string | null };

/** The listing as the API returns it, each entry flagged when the user already has that model. */
async function listing(
  userId: string,
  provider: string,
  title: string | null,
  total: number,
  truncated: boolean,
  entries: RawEntry[],
) {
  const alreadyImported = await findImportedExternalIds(
    userId,
    provider,
    entries.map((e) => e.id),
  );
  return {
    title,
    total,
    truncated,
    entries: entries.map((e) => ({
      design_id: e.id,
      title: e.title,
      cover: e.cover,
      already_imported: alreadyImported.has(e.id),
    })),
  };
}

export async function listMakerworldCollection(userId: string, input: ImportRequest) {
  const body = await withStoredMakerworldCookie(userId, input);
  const url = await normalizeImportUrl(body.url);
  const parsed = parseMakerworldCollectionUrl(url);
  if (!parsed) throw new HttpError(400, "Not a MakerWorld collection URL");
  const bearerToken = extractMakerworldBearerToken(resolveMakerworldCookie(body));

  // Sequential: fetching both at once is an unpaced burst.
  let title: string | null;
  let found: Awaited<ReturnType<typeof fetchMakerworldCollectionEntries>>;
  try {
    title = await fetchMakerworldCollectionTitle(parsed.collectionId, bearerToken);
    found = await fetchMakerworldCollectionEntries(
      parsed.collectionId,
      bearerToken,
      undefined,
      IMPORT_MAKERWORLD_CALL_DELAY_MS,
    );
  } catch (err) {
    if (err instanceof MakerworldCaptchaError) throw new HttpError(429, err.message);
    // 400, not 401: the frontend treats any 401 as an expired Thingport session.
    if (err instanceof MakerworldAuthError) throw new HttpError(400, err.message);
    throw err;
  }
  if (!found.entries.length) throw new HttpError(400, "Could not load this collection's models");
  return listing(
    userId,
    "makerworld",
    title,
    found.total,
    found.truncated,
    found.entries.map((e) => ({ id: e.designId, title: e.title, cover: e.cover })),
  );
}

export async function listThingiverseLikes(userId: string, body: ImportRequest) {
  const url = await normalizeImportUrl(body.url);
  const parsed = parseThingiverseLikesUrl(url);
  if (!parsed) throw new HttpError(400, "Not a Thingiverse Likes URL");
  const accessToken = await requireThingiverseAccessToken();

  const found = await fetchThingiverseUserLikes(parsed.username, accessToken);
  if (!found.entries.length)
    throw new HttpError(400, "Could not load this user's likes -- check the username and try again");
  return listing(
    userId,
    "thingiverse",
    `${parsed.username}'s Thingiverse Likes`,
    found.entries.length,
    found.truncated,
    found.entries.map((e) => ({ id: e.thingId, title: e.title, cover: e.cover })),
  );
}

export async function listThingiverseCollection(userId: string, body: ImportRequest) {
  const url = await normalizeImportUrl(body.url);
  const parsed = parseThingiverseCollectionUrl(url);
  if (!parsed) throw new HttpError(400, "Not a Thingiverse Collection URL");
  const accessToken = await requireThingiverseAccessToken();

  const [title, found] = await Promise.all([
    fetchThingiverseCollectionTitle(parsed.collectionId, accessToken),
    fetchThingiverseCollectionThings(parsed.collectionId, accessToken),
  ]);
  if (!found.entries.length) throw new HttpError(400, "Could not load this collection's models");
  return listing(
    userId,
    "thingiverse",
    title,
    found.entries.length,
    found.truncated,
    found.entries.map((e) => ({ id: e.thingId, title: e.title, cover: e.cover })),
  );
}

export async function listPrintablesCollection(userId: string, body: ImportRequest) {
  const url = await normalizeImportUrl(body.url);
  const parsed = parsePrintablesCollectionUrl(url);
  if (!parsed) throw new HttpError(400, "Not a Printables Collection URL");

  const found = await fetchPrintablesCollectionEntries(parsed.collectionId);
  if (!found.entries.length) throw new HttpError(400, "Could not load this collection's models");
  return listing(
    userId,
    "printables",
    found.title,
    found.total,
    found.truncated,
    found.entries.map((e) => ({ id: e.modelId, title: e.title, cover: e.cover })),
  );
}
