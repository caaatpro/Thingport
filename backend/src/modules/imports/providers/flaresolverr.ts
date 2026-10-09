import { FLARESOLVERR_SESSION_TTL_MS, FLARESOLVERR_TIMEOUT_MS, FLARESOLVERR_URL } from "../../../config";
import { logger } from "../../../lib/logger";
import { withTimeout } from "./http";

export function isFlaresolverrEnabled(): boolean {
  return Boolean(FLARESOLVERR_URL);
}

/** A Cloudflare edge block rather than an application-level 403. */
export function looksLikeCloudflareBlock(headers: Headers): boolean {
  const server = (headers.get("server") || "").toLowerCase();
  if (server.includes("cloudflare")) return true;
  if (headers.has("cf-mitigated")) return true;
  return false;
}

function parseCookieHeader(raw: string | null | undefined): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const part of (raw || "").split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    jar[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return jar;
}

// Cloudflare's clearance is bound to the solving browser's fingerprint, so its cookies can't be
// replayed. Once a host blocks us, proxy every request to it for a TTL.
const proxyHosts = new Map<string, number>();

export function shouldProxyHost(hostname: string): boolean {
  const expiresAt = proxyHosts.get(hostname.toLowerCase());
  return typeof expiresAt === "number" && Date.now() > 0 && Date.now() < expiresAt;
}

function markHostNeedsProxy(hostname: string): void {
  proxyHosts.set(hostname.toLowerCase(), Date.now() + FLARESOLVERR_SESSION_TTL_MS);
}

export type FlaresolverrResult = {
  status: number;
  body: string;
};

type FlaresolverrReply = {
  status?: string;
  solution?: { status?: number; response?: string };
};

/** GET only: FlareSolverr's POST submits a browser form, not a raw body. Null when it can't help. */
export async function fetchViaFlaresolverr(
  url: string,
  cookieHeader?: string | null,
): Promise<FlaresolverrResult | null> {
  if (!FLARESOLVERR_URL) return null;
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }

  try {
    const seedCookies = parseCookieHeader(cookieHeader);
    const cookieList = Object.entries(seedCookies).map(([name, value]) => ({ name, value, domain: hostname }));
    const body: Record<string, unknown> = {
      cmd: "request.get",
      url,
      maxTimeout: FLARESOLVERR_TIMEOUT_MS,
    };
    if (cookieList.length) body.cookies = cookieList;

    const data = await withTimeout(async (signal) => {
      const res = await fetch(FLARESOLVERR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      return res.ok ? ((await res.json()) as FlaresolverrReply) : null;
    }, FLARESOLVERR_TIMEOUT_MS);
    if (!data || data.status !== "ok" || !data.solution) return null;

    markHostNeedsProxy(hostname);
    return { status: data.solution.status ?? 200, body: data.solution.response || "" };
  } catch (err) {
    logger.debug(`FlareSolverr request for ${hostname} failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

const HTML_ENTITIES: [RegExp, string][] = [
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  [/&amp;/g, "&"],
];

/** JSON comes back wrapped in Chrome's JSON-viewer HTML; unwrap and parse it. */
export function extractJsonFromBrowserBody(body: string): unknown {
  const trimmed = body.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // not bare JSON: look for the viewer's <pre>
  }
  const match = trimmed.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!match) return null;
  // &amp; last, so "&amp;lt;" decodes to "&lt;" and not "<".
  const unescaped = HTML_ENTITIES.reduce((text, [pattern, char]) => text.replace(pattern, char), match[1]);
  try {
    return JSON.parse(unescaped);
  } catch {
    return null;
  }
}
