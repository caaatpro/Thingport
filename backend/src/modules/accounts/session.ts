import jwt from "jsonwebtoken";
import type { Role } from "../../generated/prisma/client";
import { AUTH_ALGO, AUTH_SECRET } from "../../config";
import { prisma } from "../../db";
import { getAuthTokenTtl } from "../system/index";

type TokenPayload = { sub: string; role: Role; sv?: number };

function signToken(userId: string, role: Role, sessionVersion: number, ttlSeconds: number): string {
  return jwt.sign({ sub: userId, role, sv: sessionVersion }, AUTH_SECRET, {
    algorithm: AUTH_ALGO,
    expiresIn: ttlSeconds,
  });
}

/** Uses the admin-configured session length and returns it for `expires_in`. */
export async function issueToken(userId: string, role: Role): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = await getAuthTokenTtl();
  const state = await loadSession(userId, true);
  return { token: signToken(userId, role, state?.sessionVersion ?? 0, expiresIn), expiresIn };
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, AUTH_SECRET, { algorithms: [AUTH_ALGO] }) as TokenPayload;
  } catch {
    return null;
  }
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

export async function loadSession(userId: string, fresh = false): Promise<SessionState | null> {
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
