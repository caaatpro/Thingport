import { z } from "zod";
import { maybeSleep } from "../../../../lib/concurrency";
import {
  extractJsonFromBrowserBody,
  fetchViaFlaresolverr,
  isFlaresolverrEnabled,
  looksLikeCloudflareBlock,
} from "../flaresolverr";
import { withTimeout } from "../http";
import { anyValue, isRecord, lenient, listOf, parseJson, trimmedText } from "../parse";
import { makerworldCaptchaCooloffActive, MakerworldAuthError, MakerworldCaptchaError, throwIfCaptcha } from "./captcha";
import { makerworldHeaders } from "./client";

// Not behind Cloudflare. Private collections return 403 without the bearer token, so it's sent
// whenever available.
const COLLECTION_API_BASE = "https://makerworld.com/api/v1/design-service/favorites";
const COLLECTION_PAGE_SIZE = 20;
const COLLECTION_MAX_ENTRIES = 300;

export type MakerworldCollectionEntry = {
  designId: string;
  title: string;
  cover: string | null;
};

/** Retries once through FlareSolverr if Cloudflare ever appears. Shares the CAPTCHA cooldown and
 * `paceMs` convention with cloudApi.ts, since a large collection's pagination is its own burst. */
async function fetchCollectionJson(url: string, bearerToken: string | null, paceMs?: number): Promise<unknown> {
  if (makerworldCaptchaCooloffActive()) throw new MakerworldCaptchaError();
  await maybeSleep(paceMs);
  return withTimeout(async (signal) => {
    try {
      const res = await fetch(url, {
        headers: makerworldHeaders("application/json", bearerToken),
        redirect: "follow",
        signal,
      });
      let data: unknown;
      if (res.status === 403 && isFlaresolverrEnabled() && looksLikeCloudflareBlock(res.headers)) {
        const solved = await fetchViaFlaresolverr(url, bearerToken ? `token=${bearerToken}` : null);
        if (!solved) return null;
        data = extractJsonFromBrowserBody(solved.body);
      } else {
        if (res.status === 401 || res.status === 403) throw new MakerworldAuthError();
        if (!res.ok) return null;
        data = parseJson(await res.text());
      }
      if (data === null) return null;
      throwIfCaptcha(data);
      return data;
    } catch (err) {
      if (err instanceof MakerworldCaptchaError || err instanceof MakerworldAuthError) throw err;
      return null;
    }
  });
}

const titleSchema = z.object({ title: trimmedText });

export async function fetchMakerworldCollectionTitle(
  collectionId: string,
  bearerToken: string | null = null,
  paceMs?: number,
): Promise<string | null> {
  const data = await fetchCollectionJson(`${COLLECTION_API_BASE}/${collectionId}`, bearerToken, paceMs);
  return isRecord(data) ? titleSchema.parse(data).title : null;
}

const pageSchema = z.object({
  total: anyValue,
  hits: listOf(
    lenient((hit) => {
      if (!isRecord(hit) || hit.id == null) return null;
      const designId = String(hit.id);
      return {
        designId,
        title: trimmedText.parse(hit.title) ?? `Design ${designId}`,
        cover: trimmedText.parse(hit.cover),
      };
    }),
  ),
});

/** maxItems is a safety cap against a misreported `total`, not a UX limit. `paceMs` is awaited
 * before every page, including the first. */
export async function fetchMakerworldCollectionEntries(
  collectionId: string,
  bearerToken: string | null = null,
  maxItems: number = COLLECTION_MAX_ENTRIES,
  paceMs?: number,
): Promise<{ total: number; entries: MakerworldCollectionEntry[]; truncated: boolean }> {
  const entries: MakerworldCollectionEntry[] = [];
  let total = 0;
  let offset = 0;

  for (;;) {
    const url = `${COLLECTION_API_BASE}/${collectionId}/designs?seed=0&collectionId=${collectionId}&limit=${COLLECTION_PAGE_SIZE}&offset=${offset}`;
    const data = await fetchCollectionJson(url, bearerToken, paceMs);
    if (!isRecord(data) || !Array.isArray(data.hits) || !data.hits.length) break;
    const page = pageSchema.parse(data);
    if (typeof page.total === "number") total = page.total;

    for (const hit of page.hits) {
      if (!hit) continue;
      entries.push(hit);
      if (entries.length >= maxItems) break;
    }

    offset += COLLECTION_PAGE_SIZE;
    if (entries.length >= maxItems || entries.length >= total) break;
  }

  return { total, entries, truncated: total > entries.length };
}
