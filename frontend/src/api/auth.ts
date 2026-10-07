import { authHeaders } from "../utils/auth";
import { apiBase, assertOk, readErrorMessage, EmailNotVerifiedError, UnauthorizedError } from "./client";

export type AuthUser = {
  id: string;
  email: string;
  display_name: string;
  role: "ADMIN" | "MEMBER";
  pending_email: string | null;
  bio: string | null;
  background_url: string | null;
};
export type AuthResult = { token: string; expires_in: number; user: AuthUser };
// When SMTP is configured, the account awaits email verification instead of signing in.
export type RegisterResult = AuthResult | { email_verification_required: true; email: string };

export type UpdateProfileInput = {
  current_password: string;
  email?: string;
  new_password?: string;
};

async function readAuthError(res: Response): Promise<never> {
  let message = "Request failed";
  let code: string | undefined;
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") message = data.detail;
    if (typeof data?.code === "string") code = data.code;
  } catch {}
  if (code === "EMAIL_NOT_VERIFIED") throw new EmailNotVerifiedError(message);
  throw new Error(message);
}

async function postAuth<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return readAuthError(res);
  return res.json();
}

export const authApi = {
  login: (email: string, password: string): Promise<AuthResult> => postAuth("/login", { email, password }),

  register: (payload: {
    displayName: string;
    email: string;
    password: string;
    inviteToken?: string;
  }): Promise<RegisterResult> =>
    postAuth("/register", {
      displayName: payload.displayName,
      email: payload.email,
      password: payload.password,
      ...(payload.inviteToken ? { invite_token: payload.inviteToken } : {}),
    }),

  getInvitation: async (token: string): Promise<{ email: string; expires_at: string }> => {
    const res = await fetch(`${apiBase()}/invitations/${encodeURIComponent(token)}`);
    if (!res.ok) return readAuthError(res);
    return res.json();
  },

  verifyEmail: (token: string): Promise<AuthResult> => postAuth("/verify-email", { token }),

  resendVerification: (email: string): Promise<{ message: string }> => postAuth("/resend-verification", { email }),

  /** Replies the same whether or not the email has an account. */
  forgotPassword: (email: string): Promise<{ message: string }> => postAuth("/forgot-password", { email }),

  /** The account a reset link is for; throws if the link is invalid or expired. */
  getPasswordReset: async (token: string): Promise<{ email: string }> => {
    const res = await fetch(`${apiBase()}/reset-password/${encodeURIComponent(token)}`);
    if (!res.ok) return readAuthError(res);
    return res.json();
  },

  /** Also signs in. */
  resetPassword: (token: string, newPassword: string): Promise<AuthResult> =>
    postAuth("/reset-password", { token, new_password: newPassword }),

  updateProfile: async (payload: UpdateProfileInput): Promise<{ user: AuthUser }> => {
    const res = await fetch(`${apiBase()}/profile`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to update profile"));
    }
    return res.json();
  },

  refresh: async (): Promise<{ token: string; expires_in: number }> => {
    const res = await fetch(`${apiBase()}/refresh`, {
      method: "POST",
      headers: authHeaders(),
    });
    assertOk(res, "Token refresh failed");
    return res.json();
  },

  // Best-effort: a failure must never block logout.
  logout: async (): Promise<void> => {
    try {
      await fetch(`${apiBase()}/logout`, { method: "POST", headers: authHeaders() });
    } catch {}
  },
};
