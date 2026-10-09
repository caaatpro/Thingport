import { IMPORT_HTML_MAX_BYTES, IMPORT_TIMEOUT_SECONDS, IMPORT_USER_AGENT } from "../../config";
import { HttpError } from "../../http/errors";
import { isJsonContentType } from "../../lib/files";
import {
  extractJsonFromBrowserBody,
  fetchViaFlaresolverr,
  isFlaresolverrEnabled,
  looksLikeCloudflareBlock,
  shouldProxyHost,
} from "./providers/flaresolverr";

export function parseCharset(contentType: string | null): string {
  if (!contentType) return "utf-8";
  const match = contentType.match(/charset=([^;]+)/i);
  return match ? match[1].trim().replace(/["']/g, "") : "utf-8";
}

export async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<{ buffer: Buffer; truncated: boolean }> {
  if (!response.body) return { buffer: Buffer.alloc(0), truncated: false };
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > maxBytes) {
      const allowed = chunk.length - (total - maxBytes);
      if (allowed > 0) chunks.push(chunk.subarray(0, allowed));
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(chunk);
  }
  return { buffer: Buffer.concat(chunks), truncated };
}

export async function rawFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_SECONDS * 1000);
  try {
    return await fetch(url, {
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Loads `url` through FlareSolverr and wraps the rendered body as an HTML Response. */
async function proxiedResponse(url: string, cookieHeader?: string | null): Promise<Response | null> {
  const solved = await fetchViaFlaresolverr(url, cookieHeader);
  if (!solved) return null;
  return new Response(solved.body, {
    status: solved.status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function fetchWithGuard(url: string, headers: Record<string, string>): Promise<Response> {
  try {
    let hostname = "";
    try {
      hostname = new URL(url).hostname;
    } catch {}

    let res: Response;
    if (isFlaresolverrEnabled() && shouldProxyHost(hostname)) {
      res = (await proxiedResponse(url, headers.Cookie)) || (await rawFetch(url, headers));
    } else {
      res = await rawFetch(url, headers);
      if (res.status === 403 && isFlaresolverrEnabled() && looksLikeCloudflareBlock(res.headers)) {
        const proxied = await proxiedResponse(url, headers.Cookie);
        if (proxied) res = proxied;
      }
    }

    if (!res.ok) {
      throw new HttpError(res.status || 400, `Failed to fetch URL: ${res.statusText || res.status}`);
    }
    return res;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "Failed to reach the provided URL");
  }
}

async function rawFetchBuffer(
  url: string,
  headers: Record<string, string>,
  init?: { method?: string; body?: string },
): Promise<{ status: number; headers: Headers; buffer: Buffer; url: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMPORT_TIMEOUT_SECONDS * 1000);
  try {
    const res = await fetch(url, {
      method: init?.method || "GET",
      headers,
      body: init?.body,
      redirect: "follow",
      signal: controller.signal,
    });
    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    return { status: res.status, headers: res.headers, buffer, url: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** GET-only: FlareSolverr's POST submits a browser form, not a raw body. Returns the same shape
 * as rawFetchBuffer. */
async function proxiedBuffer(
  url: string,
  cookieHeader?: string | null,
): Promise<{ status: number; headers: Headers; buffer: Buffer; url: string } | null> {
  const solved = await fetchViaFlaresolverr(url, cookieHeader);
  if (!solved) return null;
  const json = extractJsonFromBrowserBody(solved.body);
  const bodyText = json !== null ? JSON.stringify(json) : solved.body;
  const contentType = json !== null ? "application/json" : "text/html; charset=utf-8";
  return {
    status: solved.status,
    headers: new Headers({ "content-type": contentType }),
    buffer: Buffer.from(bodyText, "utf-8"),
    url,
  };
}

async function fetchCappedBuffer(
  url: string,
  headers: Record<string, string>,
  init?: { method?: string; body?: string },
): Promise<{ status: number; headers: Headers; buffer: Buffer; url: string } | null> {
  const isGet = !init?.method || init.method.toUpperCase() === "GET";
  if (!isGet || !isFlaresolverrEnabled()) {
    return rawFetchBuffer(url, headers, init);
  }

  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    return rawFetchBuffer(url, headers, init);
  }

  if (shouldProxyHost(hostname)) {
    return (await proxiedBuffer(url, headers.Cookie)) || rawFetchBuffer(url, headers, init);
  }

  const result = await rawFetchBuffer(url, headers, init);
  if (result && result.status === 403 && looksLikeCloudflareBlock(result.headers)) {
    const proxied = await proxiedBuffer(url, headers.Cookie);
    if (proxied) return proxied;
  }
  return result;
}

export async function fetchJsonFromUrl(
  url: string,
  referer?: string | null,
  headers?: Record<string, string>,
): Promise<unknown | null> {
  const requestHeaders: Record<string, string> = { "User-Agent": IMPORT_USER_AGENT, Accept: "application/json" };
  if (referer) requestHeaders.Referer = referer;
  if (headers) Object.assign(requestHeaders, headers);
  const result = await fetchCappedBuffer(url, requestHeaders);
  if (!result) return null;
  if (result.buffer.length > IMPORT_HTML_MAX_BYTES) return null;
  const contentType = result.headers.get("content-type") || "";
  if (!isJsonContentType(contentType)) {
    const trimmed = result.buffer.toString("utf-8").trimStart();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  }
  try {
    return JSON.parse(result.buffer.toString("utf-8"));
  } catch {
    return null;
  }
}
