import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "./generated/prisma/client";
import { AUTH_ALGO, AUTH_SECRET } from "./config";
import { prisma } from "./db";
import { getAuthTokenTtl } from "./services/settingsService";
import { authenticateApiToken, isRequestAllowedForScope, looksLikeApiToken } from "./services/apiTokenService";

export type TokenPayload = { sub: string; role: Role; sv?: number };

function createToken(userId: string, role: Role, sessionVersion: number, ttlSeconds: number): string {
  return jwt.sign({ sub: userId, role, sv: sessionVersion }, AUTH_SECRET, {
    algorithm: AUTH_ALGO,
    expiresIn: ttlSeconds,
  });
}

/** Uses the admin-configured session length and returns it for `expires_in`. */
export async function issueToken(userId: string, role: Role): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = await getAuthTokenTtl();
  const state = await loadSession(userId, true);
  return { token: createToken(userId, role, state?.sessionVersion ?? 0, expiresIn), expiresIn };
}

// --- Live session state -----------------------------------------------------------------------------
// A session token is a signed JWT, so on its own it would keep working after an admin disabled the
// account, changed its role or signed it out. Every request therefore also checks the user's current
// state, cached briefly (and dropped immediately when an admin changes it).

type SessionState = { role: Role; disabled: boolean; sessionVersion: number; loadedAt: number };
const SESSION_CACHE_MS = 10_000;
const sessionCache = new Map<string, SessionState>();

export function invalidateSession(userId: string): void {
  sessionCache.delete(userId);
}

async function loadSession(userId: string, fresh = false): Promise<SessionState | null> {
  const cached = sessionCache.get(userId);
  if (!fresh && cached && Date.now() - cached.loadedAt < SESSION_CACHE_MS) return cached;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, disabledAt: true, sessionVersion: true },
  });
  if (!user) {
    sessionCache.delete(userId);
    return null;
  }
  const state = {
    role: user.role,
    disabled: user.disabledAt !== null,
    sessionVersion: user.sessionVersion,
    loadedAt: Date.now(),
  };
  sessionCache.set(userId, state);
  return state;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, AUTH_SECRET, { algorithms: [AUTH_ALGO] }) as TokenPayload;
  } catch {
    return null;
  }
}

/** `?token=` is for <img>/direct file links that can't set headers. */
export function extractToken(req: Request): string | undefined {
  const header = req.header("authorization");
  const headerToken = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
  const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
  return headerToken || queryToken;
}

/** API tokens are only read from the Authorization header: unlike a session token they are never
 *  accepted in a query string, where URLs get logged and kept in browser history. */
function bearerFromHeader(req: Request): string | undefined {
  const header = req.header("authorization");
  return header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
}

async function authenticateWithApiToken(req: Request, res: Response, next: NextFunction, token: string): Promise<void> {
  try {
    const auth = await authenticateApiToken(token);
    if (!auth) {
      res.status(401).json({ detail: "Unauthorized" });
      return;
    }
    // Default-deny: a token may only call what its scope lists. Paths are matched after "/api", with
    // the query string removed.
    const path = req.originalUrl.split("?")[0].replace(/^\/api(?=\/|$)/, "");
    if (!isRequestAllowedForScope(auth.scope, req.method, path)) {
      res.status(403).json({ detail: "This API token isn't allowed to use this endpoint" });
      return;
    }
    req.userId = auth.userId;
    req.userRole = auth.role;
    req.apiToken = { id: auth.tokenId, scope: auth.scope };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Every router mounts this, so one request passes through it many times; authenticate once.
  if (req.userId) {
    next();
    return;
  }
  const bearer = bearerFromHeader(req);
  if (bearer && looksLikeApiToken(bearer)) {
    void authenticateWithApiToken(req, res, next, bearer);
    return;
  }
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ detail: "Unauthorized" });
    return;
  }
  loadSession(payload.sub)
    .then((state) => {
      // Tokens issued before sessionVersion existed carry none, which counts as version 0.
      if (!state || state.disabled || (payload.sv ?? 0) !== state.sessionVersion) {
        res.status(401).json({ detail: "Unauthorized" });
        return;
      }
      req.userId = payload.sub;
      req.userRole = state.role;
      next();
    })
    .catch(next);
}

/** Must run after requireAuth. Refuses API tokens: sensitive account actions (managing tokens, ...)
 *  need a real signed-in session, so a leaked token can't mint more tokens or widen its own access. */
export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (req.apiToken) {
    res.status(403).json({ detail: "This action needs a signed-in session, not an API token" });
    return;
  }
  next();
}

/** Must run after requireAuth. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole !== "ADMIN") {
    res.status(403).json({ detail: "Admin access required" });
    return;
  }
  next();
}
