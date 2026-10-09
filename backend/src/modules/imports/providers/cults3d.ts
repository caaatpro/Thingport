// Cults3D hands its files only to a logged-in browser (a CSRF-protected form behind Cloudflare), so the
// Thingport Grab extension clicks the page's own Download button and sends the resulting link plus the
// page's metadata. The backend never talks to the Cults3D page itself.

import { z } from "zod";
import { emptyImportedPageMetadata } from "../pageMetadata";
import { type ImportedPageMetadata } from "../types";
import { isRecord, lenient, trimmedText } from "./parse";

export const CULTS3D_MODEL_URL_PREFIX = "https://cults3d.com/en/3d-model/";

export function isCults3dHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "cults3d.com" || h.endsWith(".cults3d.com");
}

/** `/en/3d-model/<category>/<slug>`, with or without the locale prefix. The slug is unique site-wide;
 *  the category is kept only so "Open in Cults3D" can rebuild a working link. */
export function parseCults3dModelUrl(url: string): { slug: string; category: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!isCults3dHost(parsed.hostname)) return null;
  const m = parsed.pathname.match(/^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/3d-model\/([^/]+)\/([^/?#]+?)\/?$/i);
  return m ? { category: m[1].toLowerCase(), slug: m[2].toLowerCase() } : null;
}

const clipped = (max: number) => trimmedText.transform((text) => text?.slice(0, max) ?? null);

const extensionMetaSchema = z.object({
  title: clipped(200),
  description: clipped(5000),
  creator: clipped(120),
  tags: lenient((tags) =>
    Array.isArray(tags)
      ? tags
          .map((tag) => clipped(60).parse(tag))
          .filter((tag): tag is string => Boolean(tag))
          .slice(0, 30)
      : [],
  ),
  image: clipped(2000),
});

/** Only an https image on one of Cults3D's own hosts is kept. */
function cults3dImageUrl(image: string | null): string | null {
  if (!image) return null;
  try {
    const u = new URL(image);
    return u.protocol === "https:" && isCults3dHost(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** What the extension scraped from the page (JSON-LD / og tags). Client-supplied, so it's trimmed and
 *  only trusted for display; images must come from Cults3D's own hosts. */
export function cults3dMetaFromExtension(raw: unknown): ImportedPageMetadata {
  const meta = emptyImportedPageMetadata();
  if (!isRecord(raw)) return meta;
  const parsed = extensionMetaSchema.parse(raw);
  meta.title = parsed.title;
  meta.description = parsed.description;
  meta.creator = parsed.creator;
  meta.tags = parsed.tags;
  const previewImageUrl = cults3dImageUrl(parsed.image);
  if (previewImageUrl) meta.previewImageUrl = previewImageUrl;
  return meta;
}
