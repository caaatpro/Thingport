import { z } from "zod";
import { maybeSleep, sleep } from "../../../../lib/concurrency";
import { makerworldAuthorFromDesignCreator, makerworldMetaFromDesign } from "../../pageMetadata";
import { type ImportedAuthorInfo, type ImportedPageMetadata } from "../../types";
import {
  extractJsonFromBrowserBody,
  fetchViaFlaresolverr,
  isFlaresolverrEnabled,
  looksLikeCloudflareBlock,
} from "../flaresolverr";
import { withTimeout } from "../http";
import { anyValue, isRecord, lenient, listOf, objectOf, parseJson, rawText, trimmedText } from "../parse";
import { makerworldCaptchaCooloffActive, MakerworldAuthError, MakerworldCaptchaError, throwIfCaptcha } from "./captcha";
import { makerworldHeaders } from "./client";
import { extractMakerworldBearerToken } from "./urls";

// makerworld.com puts Cloudflare and a Geetest CAPTCHA in front of download resolution;
// api.bambulab.com is the same Bambu Cloud backend (same bearer token) without either.
const DESIGN_API_BASE = "https://api.bambulab.com/v1/design-service";
const PROFILE_DOWNLOAD_BASE = "https://api.bambulab.com/v1/iot-service/api/user/profile";
const AUTHOR_PROFILE_BASE = "https://makerworld.com/api/v1/design-user-service/user/profile";
// Only succeeds for a logged-in session, so it doubles as the cookie check.
const SELF_PREFERENCE_URL = "https://makerworld.com/api/v1/design-user-service/my/preference";
const MAKERWORLD_PROVIDER = "makerworld";

// A single 418 is often a one-off flag rather than the IP-level block, so retry once before
// treating it as real and triggering the hours-long captcha cooloff.
const TRANSIENT_418_RETRY_DELAY_MS = 1500;

type CloudResponse = { status: number; data: unknown };

/** Null when the request never completed (network error / timeout). */
async function fetchCloudJson(url: string, bearerToken: string): Promise<CloudResponse | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await withTimeout(async (signal) => {
        const res = await fetch(url, {
          headers: makerworldHeaders("application/json,text/plain,*/*", bearerToken),
          redirect: "follow",
          signal,
        });
        if (res.status === 418 && attempt === 0) return null;
        return { status: res.status, data: parseJson(await res.text()) };
      });
      if (result) return result;
      await sleep(TRANSIENT_418_RETRY_DELAY_MS);
    } catch {
      return null;
    }
  }
  return null;
}

/** One paced cloud call with the CAPTCHA and rejected-session outcomes turned into errors. */
async function cloudRequest(url: string, bearerToken: string, paceMs?: number): Promise<CloudResponse | null> {
  await maybeSleep(paceMs);
  const result = await fetchCloudJson(url, bearerToken);
  if (!result) return null;
  throwIfCaptcha(result.data);
  if (result.status === 401 || result.status === 403) throw new MakerworldAuthError();
  return result;
}

/** "unverifiable" means the check never reached MakerWorld, so the cookie may still be fine. */
export type MakerworldCookieCheck =
  | { result: "valid" }
  | { result: "invalid" }
  | { result: "unverifiable"; reason: "cloudflare_no_flaresolverr" | "flaresolverr_failed" | "network" };

export async function verifyMakerworldCookie(rawCookieOrToken: string): Promise<MakerworldCookieCheck> {
  const bearerToken = extractMakerworldBearerToken(rawCookieOrToken);
  if (!bearerToken) return { result: "invalid" };
  try {
    const res = await withTimeout((signal) =>
      fetch(SELF_PREFERENCE_URL, {
        headers: makerworldHeaders("application/json", bearerToken),
        redirect: "follow",
        signal,
      }),
    );
    if (res.status === 403 && looksLikeCloudflareBlock(res.headers)) {
      if (!isFlaresolverrEnabled()) return { result: "unverifiable", reason: "cloudflare_no_flaresolverr" };
      // Through FlareSolverr this answers 200 even when logged out; only a real session has a `uid`.
      const solved = await fetchViaFlaresolverr(SELF_PREFERENCE_URL, `token=${bearerToken}`);
      if (!solved) return { result: "unverifiable", reason: "flaresolverr_failed" };
      const data = extractJsonFromBrowserBody(solved.body);
      return isRecord(data) && data.uid != null ? { result: "valid" } : { result: "invalid" };
    }
    return res.ok ? { result: "valid" } : { result: "invalid" };
  } catch {
    return { result: "unverifiable", reason: "network" };
  }
}

export type MakerworldCloudResolution = {
  downloadUrl: string;
  meta: ImportedPageMetadata;
};

const authorProfileSchema = z.object({
  name: trimmedText,
  handle: trimmedText,
  avatar: trimmedText,
  personal: objectOf(
    z.object({
      handle: trimmedText,
      bio: trimmedText,
      bioTranslated: trimmedText,
      backgroundUrl: trimmedText,
      links: listOf(rawText),
    }),
  ),
});

async function fetchAuthorProfileJson(uid: string, paceMs?: number): Promise<unknown> {
  await maybeSleep(paceMs);
  const url = `${AUTHOR_PROFILE_BASE}/${uid}`;
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(url, {
        headers: makerworldHeaders("application/json"),
        redirect: "follow",
        signal,
      });
      if (res.status === 403 && isFlaresolverrEnabled() && looksLikeCloudflareBlock(res.headers)) {
        const solved = await fetchViaFlaresolverr(url, null);
        return solved ? extractJsonFromBrowserBody(solved.body) : null;
      }
      return res.ok ? parseJson(await res.text()) : null;
    });
  } catch {
    return null;
  }
}

async function fetchMakerworldAuthorInfo(uid: string, paceMs?: number): Promise<ImportedAuthorInfo | null> {
  const data = await fetchAuthorProfileJson(uid, paceMs);
  if (!isRecord(data)) return null;
  const profile = authorProfileSchema.parse(data);
  const personal = profile.personal;
  return {
    provider: MAKERWORLD_PROVIDER,
    externalId: uid,
    name: profile.name,
    handle: personal?.handle ?? profile.handle,
    bio: personal?.bio ?? null,
    bioTranslated: personal?.bioTranslated ?? null,
    links: (personal?.links ?? []).filter((link): link is string => link !== null),
    avatarUrl: profile.avatar,
    backgroundUrl: personal?.backgroundUrl ?? null,
  };
}

/** `basic` enriched with the full author profile when it can be fetched (best-effort). */
export async function completeMakerworldAuthor(
  basic: ImportedAuthorInfo | null,
  paceMs?: number,
): Promise<ImportedAuthorInfo | null> {
  if (!basic || basic.provider !== MAKERWORLD_PROVIDER) return basic;
  const profile = await fetchMakerworldAuthorInfo(basic.externalId, paceMs);
  if (!profile) return basic;
  return {
    ...basic,
    name: profile.name ?? basic.name,
    handle: profile.handle ?? basic.handle,
    bio: profile.bio ?? basic.bio,
    bioTranslated: profile.bioTranslated ?? basic.bioTranslated,
    links: profile.links.length ? profile.links : basic.links,
    avatarUrl: profile.avatarUrl ?? basic.avatarUrl,
    backgroundUrl: profile.backgroundUrl ?? basic.backgroundUrl,
  };
}

export async function fetchMakerworldDesignAuthor(
  designId: string,
  bearerToken: string,
  paceMs?: number,
): Promise<ImportedAuthorInfo | null> {
  const design = await fetchMakerworldDesign(designId, bearerToken, paceMs);
  return design ? completeMakerworldAuthor(makerworldAuthorFromDesignCreator(design.designCreator), paceMs) : null;
}

/** Which print profiles ("instances") to import: the linked one (else the default), the
 * designer's own, or all including community uploads. */
export type MakerworldProfileScope = "url" | "designer" | "all";

function instanceIdOf(inst: Record<string, unknown>): string {
  return String(inst.id);
}

/** The primary profile comes first since it creates the model; the rest are added as files.
 * A profile is the designer's when `instanceCreator` matches `designCreator` -- `isOfficial`
 * and `isDefault` say nothing about who uploaded it. */
export function selectMakerworldProfiles(
  design: Record<string, unknown>,
  scope: MakerworldProfileScope,
  requestedInstanceId: string | null,
): string[] {
  const instances = Array.isArray(design.instances)
    ? design.instances.filter(isRecord).filter((inst) => inst.id != null)
    : [];
  const ids = instances.map(instanceIdOf);
  const defaultId = design.defaultInstanceId != null ? String(design.defaultInstanceId) : null;
  const primary =
    (requestedInstanceId && ids.includes(requestedInstanceId) ? requestedInstanceId : null) ??
    (defaultId && ids.includes(defaultId) ? defaultId : null) ??
    ids[0] ??
    null;
  if (!primary) return [];
  if (scope === "url") return [primary];

  const designerUid =
    isRecord(design.designCreator) && design.designCreator.uid != null ? String(design.designCreator.uid) : null;
  const wanted = instances
    .filter((inst) => {
      if (scope === "all") return true;
      const creator = isRecord(inst.instanceCreator) ? inst.instanceCreator : null;
      return designerUid !== null && creator?.uid != null && String(creator.uid) === designerUid;
    })
    .map(instanceIdOf);
  return [primary, ...wanted.filter((id) => id !== primary)];
}

/** The raw design JSON, or null when MakerWorld didn't answer with one. */
export async function fetchMakerworldDesign(
  designId: string,
  bearerToken: string,
  paceMs?: number,
): Promise<Record<string, unknown> | null> {
  if (makerworldCaptchaCooloffActive()) throw new MakerworldCaptchaError();
  const result = await cloudRequest(`${DESIGN_API_BASE}/design/${designId}`, bearerToken, paceMs);
  return result && result.status === 200 && isRecord(result.data) ? result.data : null;
}

const designSchema = z.object({
  modelId: trimmedText,
  defaultInstanceId: lenient((v) => (v != null ? String(v) : null)),
  instances: listOf(
    lenient((inst) =>
      isRecord(inst)
        ? {
            id: inst.id != null ? String(inst.id) : null,
            profileId: inst.profileId != null ? String(inst.profileId) : null,
          }
        : null,
    ),
  ),
});

const downloadSchema = z.object({
  message: anyValue,
  url: anyValue,
  filename: trimmedText,
});

/**
 * Resolves a design to a signed download URL via api.bambulab.com. Null means fall back to page
 * scraping. `paceMs` is awaited before every request so collection imports stay evenly spaced.
 */
export async function resolveMakerworldViaCloudApi(
  designId: string,
  requestedInstanceId: string | null,
  bearerToken: string,
  paceMs?: number,
): Promise<MakerworldCloudResolution | null> {
  const designJson = await fetchMakerworldDesign(designId, bearerToken, paceMs);
  if (!designJson) return null;
  const design = designSchema.parse(designJson);
  if (!design.modelId) return null;

  const instances = design.instances.filter((inst) => inst !== null);
  const selected =
    (requestedInstanceId ? instances.find((inst) => inst.id === requestedInstanceId) : undefined) ??
    (design.defaultInstanceId ? instances.find((inst) => inst.id === design.defaultInstanceId) : undefined) ??
    instances[0];
  if (!selected?.profileId) return null;

  const download = await cloudRequest(
    `${PROFILE_DOWNLOAD_BASE}/${selected.profileId}?model_id=${encodeURIComponent(design.modelId)}`,
    bearerToken,
    paceMs,
  );
  if (!download || download.status !== 200 || !isRecord(download.data)) return null;
  const body = downloadSchema.parse(download.data);
  if (body.message !== "success" || typeof body.url !== "string" || !body.url.trim()) return null;

  const meta = makerworldMetaFromDesign(designJson);
  const author = await completeMakerworldAuthor(meta.author, paceMs);

  return {
    downloadUrl: body.url,
    meta: {
      ...meta,
      creator: author?.name ?? meta.creator,
      filename: body.filename,
      author,
      makerworldProfile: { instanceId: selected.id },
    },
  };
}
