import { IMPORT_BROWSER_USER_AGENT } from "../../config";
import { extractDownloadUrlFromResponse, findDownloadUrlInJson } from "./downloadLinks";
import { fetchJsonFromUrl } from "./fetching";
import { extractNextDataJson, getPath } from "./pageMetadata";
import type { MakerworldProfileRef } from "./types";

export function makerworldHtmlHeaders(referer?: string | null, cookie?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": IMPORT_BROWSER_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "sec-ch-ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
  };
  if (referer) headers.Referer = referer;
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function makerworldApiHeaders(
  referer?: string | null,
  nonce?: string | null,
  cookie?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": IMPORT_BROWSER_USER_AGENT,
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "X-BBL-Client-Type": "web",
    "X-BBL-Client-Version": "00.00.00.01",
    "X-BBL-App-Source": "makerworld",
    "X-BBL-Client-Name": "MakerWorld",
  };
  if (referer) headers.Referer = referer;
  if (nonce) headers["X-Nonce"] = nonce;
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function makerworldDesignIdFromNextData(data: unknown): string | null {
  const designId = getPath(data, "props", "pageProps", "design", "id");
  return designId ? String(designId) : null;
}

/** The profile named in the URL hash (if the design has it), then the default, then the first. */
function makerworldInstanceIdFromNextData(data: unknown, requestedInstanceId: string | null): string | null {
  const design = getPath(data, "props", "pageProps", "design") as Record<string, unknown> | undefined;
  if (!design) return null;
  if (requestedInstanceId && makerworldDesignHasInstance(design, requestedInstanceId)) return requestedInstanceId;
  const defaultInstance = design.defaultInstanceId;
  if (defaultInstance) return String(defaultInstance);
  const instances = design.instances;
  if (Array.isArray(instances)) {
    for (const inst of instances) {
      if (inst && typeof inst === "object" && (inst as Record<string, unknown>).id) {
        return String((inst as Record<string, unknown>).id);
      }
    }
  }
  return null;
}

function makerworldDesignHasInstance(design: Record<string, unknown>, instanceId: string): boolean {
  const instances = design.instances;
  if (!Array.isArray(instances)) return false;
  return instances.some(
    (inst) => inst && typeof inst === "object" && String((inst as Record<string, unknown>).id) === instanceId,
  );
}

function makerworldNonceFromNextData(data: unknown): string | null {
  const nonce = getPath(data, "props", "pageProps", "x-nonce");
  return typeof nonce === "string" && nonce.trim() ? nonce : null;
}

function makerworldModelIdFromUrl(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/\/models\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function fetchMakerworldInstanceDownloadUrl(
  instanceId: string,
  pageUrl: string,
  cookie: string | null,
): Promise<string | null> {
  const apiUrl = `https://makerworld.com/api/v1/design-service/instance/${instanceId}/f3mf?type=download&fileType=3mfstl`;
  const data = await fetchJsonFromUrl(apiUrl, pageUrl, makerworldApiHeaders(pageUrl, null, cookie));
  return data ? extractDownloadUrlFromResponse(data, apiUrl) : null;
}

async function fetchMakerworldModelDownloadUrl(
  modelId: string,
  pageUrl: string,
  nonce: string | null,
  cookie: string | null,
): Promise<string | null> {
  const apiUrl = `https://makerworld.com/api/v1/models/${modelId}/download`;
  const data = await fetchJsonFromUrl(apiUrl, pageUrl, makerworldApiHeaders(pageUrl, nonce, cookie));
  return data ? extractDownloadUrlFromResponse(data, apiUrl) : null;
}

/** `requestedInstanceId` is passed separately because `pageUrl` never carries the hash. Every
 *  fallback past the instance-scoped endpoint is the default profile's file. */
export async function resolveMakerworldDownloadUrl(
  html: string,
  pageUrl: string,
  makerworldCookie: string | null,
  requestedInstanceId: string | null = null,
): Promise<{ downloadUrl: string; profile: MakerworldProfileRef } | null> {
  const nextData = extractNextDataJson(html);
  let designId: string | null = null;
  let nonce: string | null = null;
  let instanceId: string | null = null;
  let defaultInstanceId: string | null = null;
  const asDefault = (downloadUrl: string) => ({ downloadUrl, profile: { instanceId: defaultInstanceId } });
  if (nextData) {
    instanceId = makerworldInstanceIdFromNextData(nextData, requestedInstanceId);
    defaultInstanceId = makerworldInstanceIdFromNextData(nextData, null);
    // A generic URL in the page data belongs to the default profile.
    if (!requestedInstanceId || instanceId !== requestedInstanceId) {
      const url = findDownloadUrlInJson(nextData, pageUrl);
      if (url) return asDefault(url);
    }
    designId = makerworldDesignIdFromNextData(nextData);
    nonce = makerworldNonceFromNextData(nextData);
  }

  if (instanceId) {
    const url = await fetchMakerworldInstanceDownloadUrl(instanceId, pageUrl, makerworldCookie);
    if (url) return { downloadUrl: url, profile: { instanceId } };
  }

  const modelId = designId || makerworldModelIdFromUrl(pageUrl);
  if (!modelId) return null;
  const url = await fetchMakerworldModelDownloadUrl(modelId, pageUrl, nonce, makerworldCookie);
  if (url) return asDefault(url);

  const apiCandidates = [
    `https://makerworld.com/api/v1/models/${modelId}`,
    `https://makerworld.com/api/v1/models/${modelId}/files`,
    `https://makerworld.com/api/v1/model/${modelId}`,
    `https://makerworld.com/api/v1/model/${modelId}/files`,
  ];
  for (const apiUrl of apiCandidates) {
    const data = await fetchJsonFromUrl(apiUrl, pageUrl);
    if (!data) continue;
    const found = findDownloadUrlInJson(data, apiUrl);
    if (found) return asDefault(found);
  }
  return null;
}
