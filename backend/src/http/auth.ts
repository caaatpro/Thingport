import type { NextFunction, Request, Response } from "express";
// Imported by file, not through the accounts index: this middleware sits below every module's routes.
import { authenticateApiToken, isRequestAllowedForScope, looksLikeApiToken } from "../modules/accounts/apiTokens";
import { loadSession, verifyToken } from "../modules/accounts/session";

/** The bearer token from the Authorization header. */
function bearerFromHeader(req: Request): string | undefined {
  const header = req.header("authorization");
  return header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
}

/** Session tokens may also come as `?token=`, for <img>/direct file links that can't set headers.
 *  API tokens never do: URLs get logged and kept in browser history. */
function extractSessionToken(req: Request): string | undefined {
  const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
  return bearerFromHeader(req) || queryToken;
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
  // Legacy routers mount this many times per request; authenticate once.
  if (req.userId) {
    next();
    return;
  }
  const bearer = bearerFromHeader(req);
  if (bearer && looksLikeApiToken(bearer)) {
    void authenticateWithApiToken(req, res, next, bearer);
    return;
  }
  const token = extractSessionToken(req);
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
