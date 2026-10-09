import { isMakerworldHost } from "../../../../lib/url";

function makerworldUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return isMakerworldHost(parsed.hostname) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseMakerworldModelUrl(url: string): { designId: string; requestedInstanceId: string | null } | null {
  const parsed = makerworldUrl(url);
  if (!parsed) return null;
  const designMatch = parsed.pathname.match(/\/models?\/(\d+)/i);
  if (!designMatch) return null;
  const hashMatch = parsed.hash.match(/profileid-(\d+)/i);
  return { designId: designMatch[1], requestedInstanceId: hashMatch ? hashMatch[1] : null };
}

export function parseMakerworldCollectionUrl(url: string): { collectionId: string } | null {
  const match = makerworldUrl(url)?.pathname.match(/\/collections\/(\d+)/i);
  return match ? { collectionId: match[1] } : null;
}

/** Pulls the `token` value out of a pasted `Cookie:` header, or accepts a bare token. */
export function extractMakerworldBearerToken(rawCookieOrToken: string | null | undefined): string | null {
  const raw = (rawCookieOrToken || "").trim();
  if (!raw) return null;
  const match = raw.match(/(?:^|;\s*)token=([^;]+)/);
  if (match) {
    const value = match[1].trim();
    if (value) return value;
  }
  if (!raw.includes(";") && !raw.includes("=") && !/\s/.test(raw)) {
    return raw;
  }
  return null;
}
