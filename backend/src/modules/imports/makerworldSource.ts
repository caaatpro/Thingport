import { IMPORT_HTML_MAX_BYTES, IMPORT_USER_AGENT } from "../../config";
import { HttpError } from "../../http/errors";
import { isHtmlContentType } from "../../lib/files";
import { maybeSleep } from "../../lib/concurrency";
import {
  completeMakerworldAuthor,
  fetchMakerworldDesign,
  resolveMakerworldViaCloudApi,
} from "./providers/makerworld/cloudApi";
import { extractMakerworldBearerToken, parseMakerworldModelUrl } from "./providers/makerworld/urls";
import {
  MakerworldAuthError,
  MakerworldCaptchaError,
  makerworldCaptchaCooloffActive,
} from "./providers/makerworld/captcha";
import { resolveMakerworldCookie } from "./cookies";
import { fetchWithGuard, readCapped } from "./fetching";
import { makerworldHtmlHeaders } from "./makerworldDownload";
import { extractNextDataJson, extractPageMetadata, makerworldMetaFromDesign } from "./pageMetadata";
import type { ImportedAuthorInfo, ImportedPageMetadata, ImportRequestBody } from "./types";

/** The model page's HTML, or null when it can't be read (blocked, not HTML). Used when there's no
 * MakerWorld login, so the API can't be asked. */
async function fetchMakerworldPageHtml(
  designId: string,
  cookie: string | null,
  paceMs?: number,
): Promise<string | null> {
  if (makerworldCaptchaCooloffActive()) throw new MakerworldCaptchaError();
  const url = `https://makerworld.com/en/models/${designId}`;
  await maybeSleep(paceMs);
  let res: Response;
  try {
    res = await fetchWithGuard(url, {
      "User-Agent": IMPORT_USER_AGENT,
      Accept: "*/*",
      ...makerworldHtmlHeaders(url, cookie),
    });
  } catch {
    return null;
  }
  if (!isHtmlContentType(res.headers.get("content-type") || "")) return null;
  const { buffer } = await readCapped(res, IMPORT_HTML_MAX_BYTES);
  return buffer.toString("utf-8");
}

/** Fallback for fetchMakerworldDesign when there's no MakerWorld login. */
async function fetchMakerworldPageDesign(
  designId: string,
  cookie: string | null,
  paceMs?: number,
): Promise<Record<string, unknown> | null> {
  const html = await fetchMakerworldPageHtml(designId, cookie, paceMs);
  if (html === null) return null;
  const nextData = extractNextDataJson(html);
  const design = (nextData as { props?: { pageProps?: { design?: unknown } } } | null)?.props?.pageProps?.design;
  return design && typeof design === "object" && !Array.isArray(design) ? (design as Record<string, unknown>) : null;
}

export async function fetchMakerworldDesignForImport(
  designId: string,
  cookie: string | null,
  paceMs?: number,
): Promise<Record<string, unknown> | null> {
  const bearer = extractMakerworldBearerToken(cookie);
  return bearer ? fetchMakerworldDesign(designId, bearer, paceMs) : fetchMakerworldPageDesign(designId, cookie, paceMs);
}

/** Fallback for fetchMakerworldDesignAuthor when there's no MakerWorld login. */
export async function fetchMakerworldPageAuthor(
  designId: string,
  cookie: string | null,
  paceMs?: number,
): Promise<ImportedAuthorInfo | null> {
  const html = await fetchMakerworldPageHtml(designId, cookie, paceMs);
  if (html === null) return null;
  return completeMakerworldAuthor(extractPageMetadata(html, "makerworld.com").author, paceMs);
}

function isMakerworldCdnUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".bblmw.com");
  } catch {
    return false;
  }
}

/** Metadata from the design the extension sent. It's client-supplied, so image fetches are
 * limited to MakerWorld's CDN and the author can't overwrite an existing record. */
export async function makerworldMetaFromExtension(
  url: string,
  body: ImportRequestBody,
): Promise<ImportedPageMetadata | null> {
  const design = body.makerworld_design;
  const parsed = parseMakerworldModelUrl(url);
  if (!design || !parsed || design.id == null || String(design.id) !== parsed.designId) return null;
  const meta = makerworldMetaFromDesign(design);
  meta.previewImageUrl = isMakerworldCdnUrl(meta.previewImageUrl) ? meta.previewImageUrl : null;
  meta.galleryImages = meta.galleryImages.filter((image) => isMakerworldCdnUrl(image.url));
  const basicAuthor = meta.author && {
    ...meta.author,
    avatarUrl: isMakerworldCdnUrl(meta.author.avatarUrl) ? meta.author.avatarUrl : null,
    unverified: true,
  };
  const author = await completeMakerworldAuthor(basicAuthor, body.makerworldPaceMs);
  return {
    ...meta,
    author,
    creator: author?.name ?? meta.creator,
    makerworldProfile: { instanceId: body.resolved_instance_id ?? null },
  };
}

type MakerworldCloudShortcut = {
  downloadUrl: string;
  meta: ImportedPageMetadata;
};

/** Null means fall back to page scraping; auth and CAPTCHA failures are rethrown as HttpErrors. */
export async function tryMakerworldCloudApi(
  url: string,
  body: ImportRequestBody,
): Promise<MakerworldCloudShortcut | null> {
  const parsed = parseMakerworldModelUrl(url);
  if (!parsed) return null;
  const bearerToken = extractMakerworldBearerToken(resolveMakerworldCookie(body));
  if (!bearerToken) return null;

  try {
    return await resolveMakerworldViaCloudApi(
      parsed.designId,
      parsed.requestedInstanceId,
      bearerToken,
      body.makerworldPaceMs,
    );
  } catch (err) {
    if (err instanceof MakerworldCaptchaError) throw new HttpError(429, err.message);
    // 400, not 401: the frontend treats any 401 as an expired Thingport session and logs out.
    if (err instanceof MakerworldAuthError) throw new HttpError(400, err.message);
    throw err;
  }
}
