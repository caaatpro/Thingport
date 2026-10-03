import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { AUTH_ALGO, AUTH_SECRET } from "./config";
import { getAuthTokenTtl } from "./services/settingsService";
import { authenticateApiToken, isRequestAllowedForScope, looksLikeApiToken } from "./services/apiTokenService";

export type TokenPayload = { sub: string; role: Role };

function createToken(userId: string, role: Role, ttlSeconds: number): string {
  return jwt.sign({ sub: userId, role }, AUTH_SECRET, {
    algorithm: AUTH_ALGO,
    expiresIn: ttlSeconds,
  });
}

/** Uses the admin-configured session length and returns it for `expires_in`. */
export async function issueToken(userId: string, role: Role): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = await getAuthTokenTtl();
  return { token: createToken(userId, role, expiresIn), expiresIn };
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
  req.userId = payload.sub;
  req.userRole = payload.role;
  next();
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
