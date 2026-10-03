import crypto from "node:crypto";
import { prisma } from "../db";
import type { Role } from "@prisma/client";

// Revocable credentials for non-browser clients (the Thingport Grab extension). The secret is shown
// once at creation; only its SHA-256 is stored, so a database leak can't be replayed. Revoking a token
// deletes its row.

export const API_TOKEN_PREFIX = "tpg_";
export const MAX_TOKENS_PER_USER = 20;
/** Don't write on every request: refresh the "last used" stamp at most this often. */
const LAST_USED_REFRESH_MS = 5 * 60 * 1000;

export function looksLikeApiToken(value: string): boolean {
  return value.startsWith(API_TOKEN_PREFIX);
}

export function hashApiToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateApiToken(): { token: string; prefix: string; tokenHash: string } {
  const token = `${API_TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
  return { token, prefix: token.slice(0, 8), tokenHash: hashApiToken(token) };
}

// --- Scopes -----------------------------------------------------------------------------------------
// A token is default-deny: it may only call what its scope lists. "grab" is exactly what the browser
// extension uses -- import endpoints, collection filing, and read-only bits -- and nothing that edits or
// deletes models, changes the account, or manages tokens. Paths are after "/api".

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

const GRAB_RULES: Rule[] = [
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
  // Thumbnails for the extension's "recent imports" strip.
  { method: "GET", path: /^\/plate\/[^/]+\/thumb\.jpg$/ },
  { method: "GET", path: /^\/preview-image\/[^/]+\/file\.jpg$/ },
];

const SCOPE_RULES: Record<string, Rule[]> = { grab: GRAB_RULES };

export const VALID_SCOPES = Object.keys(SCOPE_RULES);

/** `path` is the request path with the "/api" prefix and any query string already removed. */
export function isRequestAllowedForScope(scope: string, method: string, path: string): boolean {
  const rules = SCOPE_RULES[scope];
  if (!rules) return false;
  const m = method.toUpperCase();
  return rules.some((rule) => rule.method === m && rule.path.test(path));
}

// --- Lookup -----------------------------------------------------------------------------------------

export type ApiTokenAuth = { tokenId: string; userId: string; role: Role; scope: string };

/** Null for an unknown, expired or malformed token. */
export async function authenticateApiToken(token: string): Promise<ApiTokenAuth | null> {
  if (!looksLikeApiToken(token) || token.length > 200) return null;
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hashApiToken(token) },
    include: { user: { select: { id: true, role: true, emailVerified: true } } },
  });
  if (!row) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  // Same rule as signing in: an account that must verify its email can't act yet.
  if (!row.user.emailVerified) return null;

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_REFRESH_MS) {
    void prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return { tokenId: row.id, userId: row.user.id, role: row.user.role, scope: row.scope };
}

// --- Management -------------------------------------------------------------------------------------

export type ApiTokenOut = {
  id: string;
  name: string;
  prefix: string;
  scope: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
};

type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  scope: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
};

export function toApiTokenOut(row: TokenRow): ApiTokenOut {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scope: row.scope,
    created_at: row.createdAt.toISOString(),
    last_used_at: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    expires_at: row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}
