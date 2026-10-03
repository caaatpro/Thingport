// The only Thingport endpoints this extension ever calls. The background enforces this on every
// request, so even a compromised page script can't use the extension as a proxy to the rest of the
// API. It mirrors the backend's "grab" token scope (backend/src/services/apiTokenService.ts), which
// enforces the same list server-side; keep the two in sync. Paths are after "/api".

type Rule = { method: string; path: RegExp };

const IMPORT_ACTIONS = [
  "inspect",
  "zip",
  "zip/entries",
  "thingiverse-likes",
  "thingiverse-likes/entries",
  "thingiverse-collection",
  "thingiverse-collection/entries",
  "printables-collection",
  "printables-collection/entries",
].join("|");

const RULES: Rule[] = [
  { method: "GET", path: /^\/token\/self$/ },
  { method: "GET", path: /^\/collections$/ },
  { method: "POST", path: /^\/collections$/ },
  { method: "POST", path: /^\/collection\/[^/]+\/items\/[^/]+$/ },
  { method: "POST", path: /^\/import$/ },
  { method: "POST", path: new RegExp(`^/import/(${IMPORT_ACTIONS})$`) },
  { method: "GET", path: /^\/import\/status$/ },
  { method: "GET", path: /^\/import\/jobs\/[^/]+$/ },
  { method: "GET", path: /^\/settings\/slicer$/ },
  { method: "PATCH", path: /^\/settings\/makerworld$/ },
  { method: "GET", path: /^\/plate\/[^/]+\/thumb\.jpg$/ },
  { method: "GET", path: /^\/preview-image\/[^/]+\/file\.jpg$/ },
];

/** `path` may carry a query string. Anything that tries to climb out of the path is refused. */
export function isApiCallAllowed(method: string, path: string): boolean {
  if (typeof path !== "string" || !path.startsWith("/")) return false;
  const bare = path.split("?")[0];
  if (bare.includes("..") || bare.includes("//") || bare.includes("\\") || /%2e|%2f|%5c/i.test(bare)) return false;
  const m = String(method).toUpperCase();
  return RULES.some((rule) => rule.method === m && rule.path.test(bare));
}
