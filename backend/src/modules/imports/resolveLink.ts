import { IMPORT_HTML_MAX_BYTES, IMPORT_USER_AGENT } from "../../config";
import { cults3dMetaFromExtension, isCults3dHost } from "./providers/cults3d";
import { completeMakerworldAuthor } from "./providers/makerworld/cloudApi";
import { parseMakerworldModelUrl } from "./providers/makerworld/urls";
import { maybeSleep } from "../../lib/concurrency";
import { HttpError } from "../../http/errors";
import { isHtmlContentType } from "../../lib/files";
import { isMakerworldHost, validateRemoteUrl } from "../../lib/url";
import { resolveMakerworldCookie } from "./cookies";
import { findDownloadUrl } from "./downloadLinks";
import { fetchWithGuard, parseCharset, readCapped } from "./fetching";
import { makerworldHtmlHeaders, resolveMakerworldDownloadUrl } from "./makerworldDownload";
import { makerworldMetaFromExtension, tryMakerworldCloudApi } from "./makerworldSource";
import { emptyImportedPageMetadata, extractPageMetadata } from "./pageMetadata";
import type { ImportedPageMetadata, ImportRequestBody, OpenImportResult } from "./types";

const MAX_LANDING_PAGE_DEPTH = 3;

function hostnameOf(url: string): string {
  try {
    return (new URL(url).hostname || "").toLowerCase();
  } catch {
    return "";
  }
}

/** The landing page's own metadata, with whatever it lacks filled in from the page that linked to it. */
function mergePageMetadata(extracted: ImportedPageMetadata, inherited: ImportedPageMetadata): ImportedPageMetadata {
  return {
    title: extracted.title ?? inherited.title,
    tags: extracted.tags.length ? extracted.tags : inherited.tags,
    description: extracted.description ?? inherited.description,
    creator: extracted.creator ?? inherited.creator,
    previewImageUrl: extracted.previewImageUrl ?? inherited.previewImageUrl,
    filename: extracted.filename ?? inherited.filename,
    galleryImages: extracted.galleryImages.length ? extracted.galleryImages : inherited.galleryImages,
    author: extracted.author ?? inherited.author,
    siteCategoryIds: extracted.siteCategoryIds.length ? extracted.siteCategoryIds : inherited.siteCategoryIds,
    categorySite: extracted.categorySite ?? inherited.categorySite,
    makerworldProfile: inherited.makerworldProfile,
  };
}

/**
 * Fetches `url`, following HTML landing pages recursively until it reaches the model file.
 * `inheritedMeta` carries the landing page's metadata down to the final file response.
 */
export async function openImportResponse(
  url: string,
  body: ImportRequestBody,
  referer?: string | null,
  depth = 0,
  inheritedMeta: ImportedPageMetadata = emptyImportedPageMetadata(),
): Promise<OpenImportResult> {
  if (depth > MAX_LANDING_PAGE_DEPTH) throw new HttpError(400, "Too many redirects while resolving download link");
  const validatedUrl = await validateRemoteUrl(url);
  const host = hostnameOf(validatedUrl);

  // Only at depth 0, so a resolved download URL isn't treated as a model page on recursion.
  if (depth === 0 && isMakerworldHost(host) && !body.resolved_download_url) {
    const cloudResolved = await tryMakerworldCloudApi(validatedUrl, body);
    if (cloudResolved) {
      return openImportResponse(cloudResolved.downloadUrl, body, validatedUrl, depth + 1, cloudResolved.meta);
    }
  }
  if (depth === 0 && isMakerworldHost(host) && body.resolved_download_url) {
    const fromExtension = await makerworldMetaFromExtension(validatedUrl, body);
    if (fromExtension) {
      return openImportResponse(body.resolved_download_url, body, validatedUrl, depth + 1, fromExtension);
    }
  }

  // Cults3D only gives files to a signed-in browser, so the extension must have resolved the link.
  if (depth === 0 && isCults3dHost(host)) {
    if (!body.resolved_download_url) {
      throw new HttpError(
        400,
        "Cults3D only lets signed-in users download files. Open the model in a browser where you are logged in to Cults3D and import it with the Thingport Grab extension.",
      );
    }
    return openImportResponse(
      body.resolved_download_url,
      body,
      validatedUrl,
      depth + 1,
      cults3dMetaFromExtension(body.page_meta),
    );
  }

  const headers: Record<string, string> = {
    "User-Agent": IMPORT_USER_AGENT,
    Accept: "*/*",
  };
  let makerworldCookie: string | null = null;
  if (isMakerworldHost(host)) {
    makerworldCookie = resolveMakerworldCookie(body);
    Object.assign(headers, makerworldHtmlHeaders(referer || validatedUrl, makerworldCookie));
  }
  if (referer) headers.Referer = referer;

  await maybeSleep(body.makerworldPaceMs);
  const res = await fetchWithGuard(validatedUrl, headers);
  const finalUrl = res.url || validatedUrl;
  await validateRemoteUrl(finalUrl);

  const contentType = res.headers.get("content-type") || "";
  if (!isHtmlContentType(contentType)) return { response: res, finalUrl, meta: inheritedMeta };

  const { buffer, truncated } = await readCapped(res, IMPORT_HTML_MAX_BYTES);
  const html = buffer.toString(parseCharset(contentType) as BufferEncoding);
  const pageHost = hostnameOf(finalUrl);
  if (isCults3dHost(pageHost)) {
    throw new HttpError(
      400,
      "Cults3D answered with a web page instead of the model file (the download link needs your browser session). Make sure you are logged in to Cults3D and try again.",
    );
  }

  const extracted = extractPageMetadata(html, pageHost);
  const resolvedMeta = mergePageMetadata(extracted, inheritedMeta);
  let downloadUrl: string | null = null;
  if (isMakerworldHost(pageHost)) {
    if (extracted.author) resolvedMeta.author = await completeMakerworldAuthor(extracted.author, body.makerworldPaceMs);
    // Skipped for an extension-resolved URL: these calls can trip the CAPTCHA cooloff.
    if (body.resolved_download_url) {
      downloadUrl = body.resolved_download_url;
      resolvedMeta.makerworldProfile = { instanceId: body.resolved_instance_id ?? null };
    } else {
      if (!makerworldCookie) makerworldCookie = resolveMakerworldCookie(body);
      const requestedInstanceId = parseMakerworldModelUrl(validatedUrl)?.requestedInstanceId ?? null;
      const resolved = await resolveMakerworldDownloadUrl(html, finalUrl, makerworldCookie, requestedInstanceId);
      if (resolved) {
        downloadUrl = resolved.downloadUrl;
        resolvedMeta.makerworldProfile = resolved.profile;
      }
    }
  }
  if (!downloadUrl) downloadUrl = findDownloadUrl(html, finalUrl);
  if (!downloadUrl) {
    throw new HttpError(
      400,
      truncated
        ? "No downloadable model file found in the scanned portion of the page. Use a direct download link or increase IMPORT_HTML_MAX_KB."
        : "No downloadable model file found. Use a direct download link.",
    );
  }
  return openImportResponse(downloadUrl, body, finalUrl, depth + 1, resolvedMeta);
}
