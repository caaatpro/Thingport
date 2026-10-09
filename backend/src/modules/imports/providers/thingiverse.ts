import { z } from "zod";
import type { ImportedAuthorInfo, ImportedPageMetadata } from "../types";
import {
  extractJsonFromBrowserBody,
  fetchViaFlaresolverr,
  isFlaresolverrEnabled,
  looksLikeCloudflareBlock,
  shouldProxyHost,
} from "./flaresolverr";
import { providerHeaders, withTimeout } from "./http";
import { anyValue, idText, isRecord, listOf, namedUrlList, objectOf, parseJson, rawText, trimmedText } from "./parse";

// The official API needs an app Access Token (not a session cookie). It's still behind Cloudflare
// and returns a sticky 429 challenge after a few rapid requests, hence ThingiverseRateLimitError
// and the FlareSolverr fallback.
const THINGIVERSE_API_BASE = "https://api.thingiverse.com";
const THINGIVERSE_API_HOSTNAME = new URL(THINGIVERSE_API_BASE).hostname;
const THINGIVERSE_PROVIDER = "thingiverse";

export class ThingiverseAuthError extends Error {
  constructor() {
    super(
      "The Thingiverse Access Token configured for this instance was rejected. Ask an admin to " +
        "update it in Admin Settings (a new one can be generated at thingiverse.com/apps/create).",
    );
    this.name = "ThingiverseAuthError";
  }
}

/** Cloudflare's 429 challenge, distinct from a 404 or rejected token: the fix is to wait. */
export class ThingiverseRateLimitError extends Error {
  constructor() {
    super(
      "Thingiverse blocked this request with a rate-limit challenge (Cloudflare). This usually " +
        "clears after a while -- wait, then retry the same import.",
    );
    this.name = "ThingiverseRateLimitError";
  }
}

/** The pathname of a thingiverse.com URL, null for any other host or an unparsable URL. */
function thingiversePath(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === "thingiverse.com" || host === "www.thingiverse.com" ? parsed.pathname : null;
  } catch {
    return null;
  }
}

export function parseThingiverseThingUrl(url: string): { thingId: string } | null {
  const pathname = thingiversePath(url);
  if (pathname === null) return null;
  const m = pathname.match(/thing:(\d+)/i) ?? pathname.match(/\/things\/(\d+)/i);
  return m ? { thingId: m[1] } : null;
}

export function parseThingiverseLikesUrl(url: string): { username: string } | null {
  const m = thingiversePath(url)?.match(/^\/([^/]+)\/likes\/?$/i);
  return m ? { username: m[1] } : null;
}

/** The username in the URL is cosmetic; only the collection id is needed. */
export function parseThingiverseCollectionUrl(url: string): { collectionId: string } | null {
  const m = thingiversePath(url)?.match(/\/collections\/(\d+)/i);
  return m ? { collectionId: m[1] } : null;
}

function rawApiFetch(url: string): Promise<Response> {
  return withTimeout((signal) => fetch(url, { headers: providerHeaders({ Accept: "application/json" }), signal }));
}

/** Once a challenge is seen, calls go straight through FlareSolverr for a while. JSON API calls
 * only: FlareSolverr can't relay binary file downloads. Null for a 404 or any other non-OK answer. */
async function fetchThingiverseApiJson(path: string, accessToken: string): Promise<unknown> {
  const url = `${THINGIVERSE_API_BASE}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`;

  let res: Response;
  let viaBrowser = false;
  if (isFlaresolverrEnabled() && shouldProxyHost(THINGIVERSE_API_HOSTNAME)) {
    const solved = await fetchViaFlaresolverr(url);
    if (solved) {
      viaBrowser = true;
      res = new Response(solved.body, { status: solved.status });
    } else {
      res = await rawApiFetch(url);
    }
  } else {
    res = await rawApiFetch(url);
    if (
      (res.status === 429 || res.status === 403) &&
      isFlaresolverrEnabled() &&
      looksLikeCloudflareBlock(res.headers)
    ) {
      const solved = await fetchViaFlaresolverr(url);
      if (solved) {
        viaBrowser = true;
        res = new Response(solved.body, { status: solved.status });
      }
    }
  }

  const text = await res.text();
  const data = viaBrowser ? (text.trim() ? extractJsonFromBrowserBody(text) : null) : parseJson(text);
  if (res.status === 429) throw new ThingiverseRateLimitError();
  if (res.status === 401 || res.status === 403) throw new ThingiverseAuthError();
  return res.ok ? data : null;
}

/** Checks /users/me. A rate-limit counts as invalid, since the token can't be confirmed. */
export async function verifyThingiverseAccessToken(accessToken: string): Promise<boolean> {
  try {
    return isRecord(await fetchThingiverseApiJson("/users/me", accessToken));
  } catch {
    return false;
  }
}

export type ThingiversePlateFile = { name: string; url: string };
export type ThingiverseGalleryImage = { name: string; url: string };

export type ThingiverseThingResolution = {
  meta: Partial<ImportedPageMetadata>;
  /** Every file in `zip_data.files`, including non-model files (callers filter). Public CDN URLs. */
  plateFiles: ThingiversePlateFile[];
  /** From `zip_data.images`. */
  galleryImages: ThingiverseGalleryImage[];
};

const creatorSchema = z.object({
  id: idText,
  name: trimmedText,
  public_url: trimmedText,
  thumbnail: trimmedText,
  cover: trimmedText,
});

const thingSchema = z.object({
  name: trimmedText,
  description: trimmedText,
  tags: listOf(objectOf(z.object({ name: trimmedText }))),
  default_image: objectOf(z.object({ url: rawText })),
  thumbnail: rawText,
  creator: objectOf(creatorSchema),
  zip_data: objectOf(z.object({ files: namedUrlList, images: namedUrlList })),
});

const categorySchema = listOf(objectOf(z.object({ id: anyValue })));

function authorFromCreator(creator: z.output<typeof creatorSchema>): ImportedAuthorInfo | null {
  if (!creator.id) return null;
  return {
    provider: THINGIVERSE_PROVIDER,
    externalId: creator.id,
    name: creator.name,
    handle: creator.name,
    bio: null,
    bioTranslated: null,
    links: creator.public_url ? [creator.public_url] : [],
    avatarUrl: creator.thumbnail,
    backgroundUrl: creator.cover,
  };
}

/** Null for a Thing that doesn't exist or isn't accessible; throws ThingiverseAuthError for a
 * rejected token. */
export async function resolveThingiverseThing(
  thingId: string,
  accessToken: string,
): Promise<ThingiverseThingResolution | null> {
  const detail = await fetchThingiverseApiJson(`/things/${thingId}`, accessToken);
  if (!isRecord(detail)) return null;
  const thing = thingSchema.parse(detail);

  const meta: Partial<ImportedPageMetadata> = {};
  if (thing.name) meta.title = thing.name;
  if (thing.description) meta.description = thing.description;
  const tags = thing.tags.map((t) => t?.name).filter((name): name is string => Boolean(name));
  if (tags.length) meta.tags = tags;
  const previewImageUrl = thing.default_image?.url ?? thing.thumbnail;
  if (previewImageUrl) meta.previewImageUrl = previewImageUrl;

  if (thing.creator) {
    if (thing.creator.name) meta.creator = thing.creator.name;
    const author = authorFromCreator(thing.creator);
    if (author) meta.author = author;
  }

  // Best-effort: categories aren't inlined on the Thing resource.
  if (typeof detail.categories_url === "string" && detail.categories_url) {
    try {
      const categories = categorySchema.parse(
        await fetchThingiverseApiJson(`/things/${thingId}/categories`, accessToken),
      );
      const ids = categories
        .map((c) => (typeof c?.id === "number" ? c.id : null))
        .filter((id): id is number => id !== null);
      if (ids.length) {
        meta.siteCategoryIds = ids;
        meta.categorySite = THINGIVERSE_PROVIDER;
      }
    } catch {
      // categories are optional; a rate-limit or auth hiccup here must not fail the import
    }
  }

  return { meta, plateFiles: thing.zip_data?.files ?? [], galleryImages: thing.zip_data?.images ?? [] };
}

export type ThingiverseThingSummary = { thingId: string; title: string; cover: string | null };

const LISTING_PAGE_SIZE = 30;
const LISTING_MAX_ENTRIES = 300;

const summarySchema = z.object({
  id: anyValue,
  name: trimmedText,
  thumbnail: rawText,
  preview_image: rawText,
});

/** Pages through any endpoint returning a JSON array of Thing summaries. maxItems is a safety cap,
 * not a UX limit. */
async function paginateThingiverseThings(
  pathForPage: (page: number) => string,
  accessToken: string,
  maxItems: number,
): Promise<{ entries: ThingiverseThingSummary[]; truncated: boolean }> {
  const entries: ThingiverseThingSummary[] = [];
  let page = 1;
  for (;;) {
    const data = await fetchThingiverseApiJson(pathForPage(page), accessToken);
    if (!Array.isArray(data) || !data.length) break;
    for (const item of data) {
      if (!isRecord(item) || item.id == null) continue;
      const summary = summarySchema.parse(item);
      entries.push({
        thingId: String(item.id),
        title: summary.name ?? `Thing ${item.id}`,
        cover: summary.thumbnail ?? summary.preview_image,
      });
      if (entries.length >= maxItems) break;
    }
    if (data.length < LISTING_PAGE_SIZE || entries.length >= maxItems) break;
    page += 1;
  }
  return { entries, truncated: entries.length >= maxItems };
}

export function fetchThingiverseUserLikes(
  username: string,
  accessToken: string,
  maxItems: number = LISTING_MAX_ENTRIES,
): Promise<{ entries: ThingiverseThingSummary[]; truncated: boolean }> {
  return paginateThingiverseThings(
    (page) => `/users/${encodeURIComponent(username)}/likes?page=${page}&per_page=${LISTING_PAGE_SIZE}`,
    accessToken,
    maxItems,
  );
}

export function fetchThingiverseCollectionThings(
  collectionId: string,
  accessToken: string,
  maxItems: number = LISTING_MAX_ENTRIES,
): Promise<{ entries: ThingiverseThingSummary[]; truncated: boolean }> {
  return paginateThingiverseThings(
    (page) => `/collections/${encodeURIComponent(collectionId)}/things?page=${page}&per_page=${LISTING_PAGE_SIZE}`,
    accessToken,
    maxItems,
  );
}

const collectionSchema = z.object({ name: trimmedText });

export async function fetchThingiverseCollectionTitle(
  collectionId: string,
  accessToken: string,
): Promise<string | null> {
  const data = await fetchThingiverseApiJson(`/collections/${encodeURIComponent(collectionId)}`, accessToken);
  return isRecord(data) ? collectionSchema.parse(data).name : null;
}
