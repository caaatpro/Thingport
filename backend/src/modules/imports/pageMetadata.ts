import { isMakerworldHost } from "../../lib/url";
import type { ImportedAuthorInfo, ImportedPageMetadata } from "./types";

export function extractNextDataJson(html: string): unknown | null {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  const raw = (match[1] || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getPath(obj: unknown, ...keys: string[]): unknown {
  let current: unknown = obj;
  for (const key of keys) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function pickDesignString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** The design's photo gallery; the cover* fields are just crops of the single cover image. */
function makerworldGalleryImages(design: Record<string, unknown>): { url: string; filename: string }[] {
  const extension = design.designExtension;
  if (!isRecord(extension)) return [];
  const pictures = extension.design_pictures;
  if (!Array.isArray(pictures)) return [];
  const images: { url: string; filename: string }[] = [];
  for (const picture of pictures) {
    if (!isRecord(picture)) continue;
    const url = typeof picture.url === "string" ? picture.url.trim() : "";
    if (!url) continue;
    const filename = typeof picture.name === "string" && picture.name.trim() ? picture.name.trim() : null;
    images.push({ url, filename: filename ?? url.split("/").pop() ?? "preview.jpg" });
  }
  return images;
}

/** Most-specific first. All ids are kept so a category configured for a parent still matches. */
function makerworldCategoryIds(design: Record<string, unknown>): number[] {
  const categories = design.categories;
  if (!Array.isArray(categories)) return [];
  const ids: number[] = [];
  for (const category of categories) {
    if (!isRecord(category)) continue;
    const id = category.id;
    if (typeof id === "number" && Number.isInteger(id)) ids.push(id);
    else if (typeof id === "string" && /^\d+$/.test(id)) ids.push(Number(id));
  }
  return ids;
}

/** Same shape from the design API, the page's __NEXT_DATA__, or the extension. Download-specific
 * fields are left to the caller. */
export function makerworldMetaFromDesign(design: unknown): ImportedPageMetadata {
  const meta = emptyImportedPageMetadata();
  if (!isRecord(design)) return meta;
  const title = pickDesignString(design, ["title"]);
  meta.title = title ? decodeHtmlEntities(title) : null;
  meta.tags = Array.isArray(design.tags)
    ? design.tags
        .filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
        .map((tag) => tag.trim())
    : [];
  meta.description =
    typeof design.summary === "string" && design.summary.trim() ? htmlToPlainText(design.summary) : null;
  const designCreator = isRecord(design.designCreator) ? design.designCreator : null;
  meta.creator = designCreator ? pickDesignString(designCreator, ["nickName", "name", "handle"]) : null;
  meta.author = makerworldAuthorFromDesignCreator(designCreator);
  meta.previewImageUrl = pickDesignString(design, ["coverUrl", "coverPortrait", "coverLandscape"]);
  meta.galleryImages = makerworldGalleryImages(design);
  meta.siteCategoryIds = makerworldCategoryIds(design);
  meta.categorySite = meta.siteCategoryIds.length ? "makerworld" : null;
  return meta;
}

/** Enough for a linked author with an avatar, without the Cloudflare-gated author-profile
 * endpoint. */
export function makerworldAuthorFromDesignCreator(creator: unknown): ImportedAuthorInfo | null {
  if (!creator || typeof creator !== "object") return null;
  const record = creator as Record<string, unknown>;
  if (record.uid == null || String(record.uid).trim() === "") return null;
  const pick = (keys: string[]): string | null => {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };
  return {
    provider: "makerworld",
    externalId: String(record.uid).trim(),
    name: pick(["name", "nickName"]),
    handle: pick(["handle"]),
    bio: null,
    bioTranslated: null,
    links: [],
    avatarUrl: pick(["avatar", "avatarUrl", "headIcon"]),
    backgroundUrl: null,
  };
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function htmlToPlainText(html: string): string | null {
  const withBreaks = html.replace(/<\s*(br|\/p|\/li|\/div|\/h[1-6])\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
  const text = decodeHtmlEntities(withBreaks)
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

function genericTitleFromHtml(html: string): string | null {
  const ogMatch =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
  if (ogMatch && ogMatch[1].trim()) return decodeHtmlEntities(ogMatch[1].trim());
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1].trim()) return decodeHtmlEntities(titleMatch[1].trim());
  return null;
}

export function emptyImportedPageMetadata(): ImportedPageMetadata {
  return {
    title: null,
    tags: [],
    description: null,
    creator: null,
    previewImageUrl: null,
    filename: null,
    galleryImages: [],
    author: null,
    siteCategoryIds: [],
    categorySite: null,
  };
}

/** Best-effort metadata for a landing page. Only MakerWorld has more than a title. */
export function extractPageMetadata(html: string, pageHost: string): ImportedPageMetadata {
  const meta = emptyImportedPageMetadata();
  if (isMakerworldHost(pageHost)) {
    const fromDesign = makerworldMetaFromDesign(getPath(extractNextDataJson(html), "props", "pageProps", "design"));
    if (!fromDesign.title) fromDesign.title = genericTitleFromHtml(html);
    return fromDesign;
  }
  meta.title = genericTitleFromHtml(html);
  return meta;
}
