// What the import pipeline and the settings routes use from the provider clients.

export {
  extractJsonFromBrowserBody,
  fetchViaFlaresolverr,
  isFlaresolverrEnabled,
  looksLikeCloudflareBlock,
  shouldProxyHost,
} from "./flaresolverr";

export { CULTS3D_MODEL_URL_PREFIX, cults3dMetaFromExtension, isCults3dHost, parseCults3dModelUrl } from "./cults3d";

export {
  MAKERWORLD_CAPTCHA_MESSAGE,
  MakerworldAuthError,
  MakerworldCaptchaError,
  makerworldCaptchaCooloffActive,
} from "./makerworld/captcha";
export {
  completeMakerworldAuthor,
  fetchMakerworldDesign,
  fetchMakerworldDesignAuthor,
  resolveMakerworldViaCloudApi,
  selectMakerworldProfiles,
  verifyMakerworldCookie,
  type MakerworldCloudResolution,
  type MakerworldCookieCheck,
  type MakerworldProfileScope,
} from "./makerworld/cloudApi";
export {
  fetchMakerworldCollectionEntries,
  fetchMakerworldCollectionTitle,
  type MakerworldCollectionEntry,
} from "./makerworld/collections";
export { getUserMakerworldCookie, setUserMakerworldCookie } from "./makerworld/cookie";
export { extractMakerworldBearerToken, parseMakerworldCollectionUrl, parseMakerworldModelUrl } from "./makerworld/urls";

export {
  fetchPrintablesCollectionEntries,
  fetchPrintablesCollectionTitle,
  parsePrintablesCollectionUrl,
  parsePrintablesModelUrl,
  resolvePrintablesDownloadLinks,
  resolvePrintablesModel,
  type PrintablesCollectionEntry,
  type PrintablesGalleryImage,
  type PrintablesModelResolution,
  type PrintablesPlateFile,
} from "./printables";

export {
  fetchThingiverseCollectionThings,
  fetchThingiverseCollectionTitle,
  fetchThingiverseUserLikes,
  parseThingiverseCollectionUrl,
  parseThingiverseLikesUrl,
  parseThingiverseThingUrl,
  resolveThingiverseThing,
  ThingiverseAuthError,
  ThingiverseRateLimitError,
  verifyThingiverseAccessToken,
  type ThingiverseGalleryImage,
  type ThingiversePlateFile,
  type ThingiverseThingResolution,
  type ThingiverseThingSummary,
} from "./thingiverse";
