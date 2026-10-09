import path from "node:path";
import * as cheerio from "cheerio";
import { IMPORT_ALLOWED_EXTS, IMPORT_BLOCKED_EXTS, IMPORT_EXT_PRIORITY } from "../../config";

function scoreDownloadUrl(url: string): number {
  const lower = url.toLowerCase();
  let score = 0;
  if (lower.includes("download")) score += 6;
  if (lower.includes("files")) score += 2;
  IMPORT_EXT_PRIORITY.forEach((ext, idx) => {
    if (lower.includes(ext)) score += (IMPORT_EXT_PRIORITY.length - idx) * 10;
  });
  return score;
}

function isPotentialUrl(value: string): boolean {
  if (/\s/.test(value)) return false;
  if (/[<>{}"\\^`]/.test(value)) return false;
  return true;
}

function containsAllowedExt(url: string): boolean {
  const lower = url.toLowerCase();
  for (const ext of IMPORT_ALLOWED_EXTS) {
    const re = new RegExp(`${ext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[?#&])`);
    if (re.test(lower)) return true;
  }
  return false;
}

function isAllowedDownloadCandidate(url: string): boolean {
  const lower = url.toLowerCase();
  let ext = "";
  try {
    ext = path.extname(new URL(url).pathname).toLowerCase();
  } catch {
    ext = "";
  }
  if (ext) {
    if (IMPORT_ALLOWED_EXTS.has(ext)) return true;
    if (IMPORT_BLOCKED_EXTS.has(ext)) return false;
    if (lower.includes("download")) return true;
    return containsAllowedExt(lower);
  }
  if (containsAllowedExt(lower)) return true;
  return lower.includes("download");
}

/** Collects href/src/data-* link-ish attributes from every element in the page. */
function collectPageLinks(html: string): string[] {
  const links: string[] = [];
  const attrNames = ["href", "src", "data-download", "data-download-url", "data-url", "data-file", "data-href"];
  try {
    const $ = cheerio.load(html);
    $("*").each((_, el) => {
      const attribs = (el as unknown as { attribs?: Record<string, string> }).attribs;
      if (!attribs) return;
      for (const name of attrNames) {
        const value = attribs[name];
        if (value) links.push(value);
      }
    });
  } catch {}
  return links;
}

export function findDownloadUrl(html: string, baseUrl: string): string | null {
  const links = collectPageLinks(html);
  const urlMatches = html.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  links.push(...urlMatches);

  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const rawLink of links) {
    const link = (rawLink || "").trim();
    if (!link || link.startsWith("#")) continue;
    if (/^javascript:/i.test(link) || /^mailto:/i.test(link)) continue;
    let absUrl: string;
    try {
      absUrl = new URL(link, baseUrl).toString();
    } catch {
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(absUrl);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    if (seen.has(absUrl)) continue;
    seen.add(absUrl);
    if (isAllowedDownloadCandidate(absUrl)) candidates.push(absUrl);
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => scoreDownloadUrl(b) - scoreDownloadUrl(a));
  return candidates[0];
}

function normalizeCandidateUrl(raw: string, baseUrl: string): string | null {
  const value = (raw || "").trim();
  if (!value) return null;
  if (!isPotentialUrl(value)) return null;
  let candidate = value;
  if (candidate.startsWith("//")) candidate = `https:${candidate}`;
  if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
    return isAllowedDownloadCandidate(candidate) ? candidate : null;
  }
  if (candidate.startsWith("/") || candidate.includes("/")) {
    try {
      const abs = new URL(candidate, baseUrl).toString();
      return isAllowedDownloadCandidate(abs) ? abs : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function findDownloadUrlInJson(data: unknown, baseUrl: string): string | null {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const stack: unknown[] = [data];
  while (stack.length) {
    const current = stack.pop();
    if (current && typeof current === "object" && !Array.isArray(current)) {
      stack.push(...Object.values(current as Record<string, unknown>));
    } else if (Array.isArray(current)) {
      stack.push(...current);
    } else if (typeof current === "string") {
      if (seen.has(current)) continue;
      seen.add(current);
      const url = normalizeCandidateUrl(current, baseUrl);
      if (url) candidates.push(url);
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => scoreDownloadUrl(b) - scoreDownloadUrl(a));
  return candidates[0];
}

export function extractDownloadUrlFromResponse(data: unknown, baseUrl: string): string | null {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const dict = data as Record<string, unknown>;
    for (const key of ["url", "downloadUrl", "download_url"]) {
      const value = dict[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    const inner = dict.data;
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const innerDict = inner as Record<string, unknown>;
      for (const key of ["url", "downloadUrl", "download_url"]) {
        const value = innerDict[key];
        if (typeof value === "string" && value.trim()) return value;
      }
    }
  }
  return findDownloadUrlInJson(data, baseUrl);
}
