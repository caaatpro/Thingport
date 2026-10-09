import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { authApi, type AuthResult, type AuthUser } from "../api/auth";
import { healthApi, type HealthInfo } from "../api/health";
import { clearToken, clearUser, readToken, readUser, storeToken, storeUser } from "../utils/auth";
import { useToast } from "../ui";

export type AuthState = {
  token: string | null;
  user: AuthUser | null;
  isAdmin: boolean;
  /** Null while the first health check is in flight; `ok` false when the API is unreachable. */
  health: HealthInfo | null;
  /** Call with a successful login/register/verify/reset result. */
  login: (result: AuthResult) => void;
  logout: () => void;
  /** PATCH /profile doesn't reissue a token, so only the stored user changes. */
  updateUser: (user: AuthUser) => void;
  /** For code that catches an UnauthorizedError itself; React Query errors are handled centrally. */
  onUnauthorized: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

const DEFAULT_REFRESH_SECONDS = 6 * 60 * 60;

export function AuthProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(() => readToken());
  const [user, setUser] = useState<AuthUser | null>(() => readUser());
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [ttl, setTtl] = useState<number | null>(null);
  // A ref so concurrent 401s see the guard synchronously and only one toast shows.
  const expiredRef = useRef(false);

  useEffect(() => {
    void healthApi.get().then(setHealth);
  }, []);

  const login = useCallback((result: AuthResult) => {
    storeToken(result.token);
    storeUser(result.user);
    setToken(result.token);
    setUser(result.user);
    setTtl(result.expires_in);
    expiredRef.current = false;
  }, []);

  const onUnauthorized = useCallback(() => {
    if (expiredRef.current) return;
    expiredRef.current = true;
    clearToken();
    setToken(null);
    setTtl(null);
    toast.error("Your session expired. Please sign in again.");
  }, [toast]);

  const logout = useCallback(() => {
    // Fire-and-forget: signing out locally must not wait on the network.
    void authApi.logout().catch(() => undefined);
    clearToken();
    clearUser();
    setToken(null);
    setUser(null);
    setTtl(null);
  }, []);

  const updateUser = useCallback((next: AuthUser) => {
    storeUser(next);
    setUser(next);
  }, []);

  // Renew the token well before it lapses.
  useEffect(() => {
    if (!token) return;
    const seconds = ttl ?? DEFAULT_REFRESH_SECONDS;
    const refreshMs = Math.max(5 * 60 * 1000, Math.min(seconds * 0.8 * 1000, seconds * 1000 - 5 * 60 * 1000));
    const timer = window.setTimeout(async () => {
      try {
        const res = await authApi.refresh();
        storeToken(res.token);
        setToken(res.token);
        setTtl(res.expires_in);
      } catch {
        onUnauthorized();
      }
    }, refreshMs);
    return () => window.clearTimeout(timer);
  }, [token, ttl, onUnauthorized]);

  const value = useMemo<AuthState>(
    () => ({ token, user, isAdmin: user?.role === "ADMIN", health, login, logout, updateUser, onUnauthorized }),
    [token, user, health, login, logout, updateUser, onUnauthorized],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** The signed-in user. Only call inside the authenticated part of the app. */
export function useUser(): AuthUser {
  const { user } = useAuth();
  if (!user) throw new Error("useUser called while signed out");
  return user;
}
