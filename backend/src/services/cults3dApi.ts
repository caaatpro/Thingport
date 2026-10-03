// Cults3D hands its files only to a logged-in browser (a CSRF-protected form behind Cloudflare), so the
// Thingport Grab extension clicks the page's own Download button and sends the resulting link plus the
// page's metadata. The backend never talks to the Cults3D page itself.

import { emptyImportedPageMetadata, type ImportedPageMetadata } from "./importResolvers";

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

export const CULTS3D_MODEL_URL_PREFIX = "https://cults3d.com/en/3d-model/";

function str(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

/** What the extension scraped from the page (JSON-LD / og tags). Client-supplied, so it's trimmed and
 *  only trusted for display; images must come from Cults3D's own hosts. */
export function cults3dMetaFromExtension(raw: unknown): ImportedPageMetadata {
  const meta = emptyImportedPageMetadata();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return meta;
  const r = raw as Record<string, unknown>;
  meta.title = str(r.title, 200);
  meta.description = str(r.description, 5000);
  meta.creator = str(r.creator, 120);
  meta.tags = Array.isArray(r.tags)
    ? r.tags
        .map((tag) => str(tag, 60))
        .filter((tag): tag is string => Boolean(tag))
        .slice(0, 30)
    : [];
  const image = str(r.image, 2000);
  if (image) {
    try {
      const u = new URL(image);
      if (u.protocol === "https:" && isCults3dHost(u.hostname)) meta.previewImageUrl = u.toString();
    } catch {
      // not a URL: no preview
    }
  }
  return meta;
}

