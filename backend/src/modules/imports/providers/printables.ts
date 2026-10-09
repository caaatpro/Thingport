import { z } from "zod";
import { IMPORT_HTML_MAX_BYTES } from "../../../config";
import { HttpError } from "../../../http/errors";
import { htmlToPlainText } from "../pageMetadata";
import { type ImportedAuthorInfo, type ImportedPageMetadata } from "../types";
import { providerHeaders, withTimeout } from "./http";
import { anyValue, idText, isRecord, lenient, listOf, objectOf, parseJson, trimmedText } from "./parse";

// Unlike Cloudflare-gated www.printables.com, the GraphQL API answers unauthenticated requests.
const PRINTABLES_GRAPHQL_URL = "https://api.printables.com/graphql/";
const PRINTABLES_MEDIA_BASE = "https://media.printables.com/";
const PRINTABLES_PROVIDER = "printables";

const mediaUrl = lenient((filePath) =>
  typeof filePath === "string" && filePath.trim() ? `${PRINTABLES_MEDIA_BASE}${filePath.trim()}` : null,
);

/** The `{ data: ... }` envelope of a GraphQL answer. */
function graphqlData(response: unknown): Record<string, unknown> | null {
  return isRecord(response) && isRecord(response.data) ? response.data : null;
}

function printablesPath(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host === "printables.com" || host === "www.printables.com" ? parsed.pathname : null;
  } catch {
    return null;
  }
}

export function parsePrintablesModelUrl(url: string): { modelId: string } | null {
  const m = printablesPath(url)?.match(/\/model\/(\d+)/i);
  return m ? { modelId: m[1] } : null;
}

/** The `@handle` segment is cosmetic; only the id is used. */
export function parsePrintablesCollectionUrl(url: string): { collectionId: string } | null {
  const m = printablesPath(url)?.match(/\/collections\/(\d+)/i);
  return m ? { collectionId: m[1] } : null;
}

/** Null when the call fails or the answer isn't usable JSON; a 429 is surfaced to the user. */
async function fetchPrintablesGraphql(query: string, variables: Record<string, unknown>): Promise<unknown> {
  let res: Response;
  try {
    res = await withTimeout((signal) =>
      fetch(PRINTABLES_GRAPHQL_URL, {
        method: "POST",
        headers: providerHeaders({
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://www.printables.com",
        }),
        body: JSON.stringify({ query, variables }),
        signal,
      }),
    );
  } catch {
    return null;
  }

  const text = await res.text();
  if (res.status === 429) throw new HttpError(429, "Printables rate-limited this request. Wait a bit and try again.");
  if (!res.ok || text.length > IMPORT_HTML_MAX_BYTES) return null;
  return parseJson(text);
}

function parsePrintablesErrorMessages(errors: unknown): string | null {
  if (!Array.isArray(errors)) return null;
  const messages: string[] = [];
  for (const err of errors) {
    if (!isRecord(err) || !Array.isArray(err.messages)) continue;
    for (const v of err.messages) if (typeof v === "string" && v.trim()) messages.push(v.trim());
  }
  return messages.length ? messages.join(", ") : null;
}

const MODEL_QUERY = `
  query ($id: ID!) {
    print(id: $id) {
      id
      name
      description
      user { id handle publicUsername avatarFilePath }
      image { filePath }
      images { filePath }
      tags { name }
      category { id name }
      stls { id name }
    }
  }
`;

const DOWNLOAD_LINK_MUTATION = `
  mutation ($printId: ID!, $source: DownloadSourceEnum!, $files: [DownloadFileInput!]) {
    getDownloadLink(printId: $printId, source: $source, files: $files) {
      ok
      errors { field messages code }
      output { files { id link } }
    }
  }
`;

const userSchema = z.object({
  id: idText,
  handle: trimmedText,
  publicUsername: trimmedText,
  avatarFilePath: mediaUrl,
});

function authorFromUser(user: z.output<typeof userSchema>): ImportedAuthorInfo | null {
  if (!user.id) return null;
  return {
    provider: PRINTABLES_PROVIDER,
    externalId: user.id,
    name: user.publicUsername || user.handle,
    handle: user.handle,
    bio: null,
    bioTranslated: null,
    links: user.handle ? [`https://www.printables.com/@${user.handle}`] : [],
    avatarUrl: user.avatarFilePath,
    backgroundUrl: null,
  };
}

const modelSchema = z.object({
  name: trimmedText,
  description: anyValue,
  tags: listOf(objectOf(z.object({ name: trimmedText }))),
  image: objectOf(z.object({ filePath: mediaUrl })),
  images: listOf(objectOf(z.object({ filePath: mediaUrl }))),
  user: objectOf(userSchema),
  category: objectOf(z.object({ id: anyValue })),
  stls: listOf(objectOf(z.object({ id: anyValue, name: anyValue }))),
});

export type PrintablesPlateFile = { name: string; id: string };
export type PrintablesGalleryImage = { name: string; url: string };

export type PrintablesModelResolution = {
  meta: Partial<ImportedPageMetadata>;
  /** From the `stls` bucket, which holds every model-file type despite its name. Pre-sliced
   * gcodes/slas are excluded. Download links are resolved separately. */
  plateFiles: PrintablesPlateFile[];
  /** Includes the cover image. */
  galleryImages: PrintablesGalleryImage[];
};

/** Null for a model that doesn't exist or isn't public. */
export async function resolvePrintablesModel(modelId: string): Promise<PrintablesModelResolution | null> {
  const print = graphqlData(await fetchPrintablesGraphql(MODEL_QUERY, { id: modelId }))?.print;
  if (!isRecord(print)) return null;
  const model = modelSchema.parse(print);

  const meta: Partial<ImportedPageMetadata> = {};
  if (model.name) meta.title = model.name;
  if (typeof model.description === "string" && model.description.trim()) {
    const plainText = htmlToPlainText(model.description);
    if (plainText) meta.description = plainText;
  }
  const tags = model.tags.map((t) => t?.name).filter((name): name is string => Boolean(name));
  if (tags.length) meta.tags = tags;
  if (model.image?.filePath) meta.previewImageUrl = model.image.filePath;

  const galleryImages: PrintablesGalleryImage[] = [];
  model.images.forEach((img, idx) => {
    if (img?.filePath) galleryImages.push({ name: `image-${idx}.jpg`, url: img.filePath });
  });

  const author = model.user ? authorFromUser(model.user) : null;
  if (author) {
    meta.author = author;
    meta.creator = author.name;
  }

  if (model.category && model.category.id != null) {
    const categoryId = Number(model.category.id);
    if (Number.isFinite(categoryId)) {
      meta.siteCategoryIds = [categoryId];
      meta.categorySite = PRINTABLES_PROVIDER;
    }
  }

  const plateFiles: PrintablesPlateFile[] = [];
  for (const f of model.stls) {
    if (f && typeof f.name === "string" && f.id != null) plateFiles.push({ name: f.name, id: String(f.id) });
  }

  return { meta, plateFiles, galleryImages };
}

const downloadResultSchema = z.object({
  ok: anyValue,
  errors: anyValue,
  output: objectOf(
    z.object({
      files: listOf(objectOf(z.object({ id: anyValue, link: trimmedText }))),
    }),
  ),
});

/** Printables has no static file URLs; every download goes through this mutation. A file missing
 * from the response is skipped. */
export async function resolvePrintablesDownloadLinks(modelId: string, fileIds: string[]): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  if (!fileIds.length) return links;

  const result = graphqlData(
    await fetchPrintablesGraphql(DOWNLOAD_LINK_MUTATION, {
      printId: modelId,
      source: "model_detail",
      files: [{ fileType: "stl", ids: fileIds }],
    }),
  )?.getDownloadLink;
  if (!isRecord(result)) return links;
  const parsed = downloadResultSchema.parse(result);
  if (parsed.ok === false) {
    throw new HttpError(400, parsePrintablesErrorMessages(parsed.errors) || "Printables rejected the download request");
  }
  for (const entry of parsed.output?.files ?? []) {
    if (entry && entry.id != null && entry.link) links.set(String(entry.id), entry.link);
  }
  return links;
}

export type PrintablesCollectionEntry = { modelId: string; title: string; cover: string | null };

/** Thumbnail listings have no name, only a slug. */
function titleFromSlug(slug: string): string {
  const words = slug.split("-").filter(Boolean);
  if (!words.length) return slug;
  return (
    words[0].charAt(0).toUpperCase() + words[0].slice(1) + (words.length > 1 ? " " + words.slice(1).join(" ") : "")
  );
}

const COLLECTION_TITLE_QUERY = `query ($id: ID!) { collection(id: $id) { id name } }`;

const collectionTitleSchema = z.object({ name: trimmedText });

export async function fetchPrintablesCollectionTitle(collectionId: string): Promise<string | null> {
  const collection = graphqlData(
    await fetchPrintablesGraphql(COLLECTION_TITLE_QUERY, { id: collectionId }),
  )?.collection;
  return isRecord(collection) ? collectionTitleSchema.parse(collection).name : null;
}

// The site's own "load more" query. The last page ends with an empty-string cursor, not null --
// a `cursor == null` check restarts from page 1 forever.
const COLLECTION_MODELS_QUERY = `
  query CollectionModels($collectionId: ID!, $limit: Int, $cursor: String, $ordering: CollectionPrintsOrderingEnum) {
    moreCollectionModels(limit: $limit, cursor: $cursor, collectionId: $collectionId, ordering: $ordering) {
      items {
        id
        model: print { id name slug image { filePath } }
      }
      cursor
    }
  }
`;

const COLLECTION_PAGE_SIZE = 30;
const COLLECTION_MAX_PAGES = 20;
const COLLECTION_MAX_ENTRIES = 600;

const collectionPageSchema = z.object({
  cursor: lenient((v) => (typeof v === "string" ? v : null)),
  items: listOf(
    objectOf(
      z.object({
        model: objectOf(
          z.object({
            id: idText,
            slug: trimmedText,
            image: objectOf(z.object({ filePath: mediaUrl })),
          }),
        ),
      }),
    ),
  ),
});

/** The caps are a safety net against a non-terminating cursor. Items for deleted/hidden models
 * are skipped. */
async function fetchAllPrintablesCollectionModels(collectionId: string): Promise<PrintablesCollectionEntry[]> {
  const found = new Map<string, PrintablesCollectionEntry>();
  let cursor: string | null = null;
  for (let page = 0; page < COLLECTION_MAX_PAGES && found.size < COLLECTION_MAX_ENTRIES; page++) {
    const node = graphqlData(
      await fetchPrintablesGraphql(COLLECTION_MODELS_QUERY, {
        collectionId,
        limit: COLLECTION_PAGE_SIZE,
        cursor,
        ordering: "added_to_collection",
      }),
    )?.moreCollectionModels;
    const { items, cursor: nextCursor } = collectionPageSchema.parse(isRecord(node) ? node : {});
    if (!items.length) break;

    for (const item of items) {
      if (found.size >= COLLECTION_MAX_ENTRIES) break;
      const model = item?.model;
      if (!model || model.id === null || !model.slug || found.has(model.id)) continue;
      found.set(model.id, {
        modelId: model.id,
        title: titleFromSlug(model.slug),
        cover: model.image?.filePath ?? null,
      });
    }

    if (!nextCursor) break; // empty string or null/undefined both mean "no more pages"
    cursor = nextCursor;
  }
  return Array.from(found.values());
}

/** `truncated` only when the safety caps were hit. */
export async function fetchPrintablesCollectionEntries(
  collectionId: string,
): Promise<{ title: string | null; entries: PrintablesCollectionEntry[]; total: number; truncated: boolean }> {
  const [title, entries] = await Promise.all([
    fetchPrintablesCollectionTitle(collectionId),
    fetchAllPrintablesCollectionModels(collectionId),
  ]);
  return { title, entries, total: entries.length, truncated: entries.length >= COLLECTION_MAX_ENTRIES };
}
