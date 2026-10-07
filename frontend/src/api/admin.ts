import { authHeaders } from "../utils/auth";
import { apiBase, assertOk, readErrorMessage, UnauthorizedError } from "./client";

export type AdminUser = {
  id: string;
  email: string;
  display_name: string;
  role: "ADMIN" | "MEMBER";
  print_count: number;
  collection_count: number;
  storage_bytes: number;
  api_token_count: number;
  makerworld_connected: boolean;
  email_verified: boolean;
  disabled: boolean;
  last_login_at: string | null;
  created_at: string;
};

export type AdminOverview = {
  users: { total: number; admins: number; disabled: number; active_7d: number; pending_invitations: number };
  library: { models: number; collections: number; model_bytes: number };
  processing: { queued: number; processing: number; failed: number };
  imports: { running: number; failed_24h: number };
};

export type CreateUserInput = { email: string; display_name: string; role: "ADMIN" | "MEMBER"; password?: string };
export type UpdateUserInput = { display_name?: string; role?: "ADMIN" | "MEMBER"; disabled?: boolean };

/** Admin writes: a 401 means the session ended; anything else surfaces the server's own message. */
async function adminRequest<T>(method: string, path: string, fallback: string, body?: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: authHeaders(body === undefined ? undefined : { "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(await readErrorMessage(res, fallback));
  return res.json();
}

export type LogAction =
  | "user_logged_in"
  | "user_logged_out"
  | "password_reset_requested"
  | "password_reset"
  | "user_invited"
  | "user_created"
  | "user_updated"
  | "user_role_changed"
  | "user_disabled"
  | "user_enabled"
  | "user_deleted"
  | "user_signed_out"
  | "password_reset_link_created"
  | "processing_retried"
  | "authors_linked"
  | "model_uploaded"
  | "model_imported"
  | "import_completed"
  | "model_edited"
  | "model_deleted"
  | "collection_created"
  | "collection_edited"
  | "collection_deleted"
  | "collection_item_added"
  | "collection_item_removed";

export type LogEntry = {
  id: string;
  user_id: string;
  user_display_name: string;
  user_email: string;
  action: LogAction;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type StorageUsage = {
  model_bytes: number; // every plate + supporting/prepared file, across all users
  model_count: number;
};

export type AuthorLookupProblem =
  "thingiverse_no_token" | "thingiverse_token_rejected" | "makerworld_captcha" | "makerworld_login_rejected";

export type AuthorLinkingRun = {
  running: boolean;
  startedAt: string;
  finishedAt: string | null;
  toLookUp: number;
  lookedUp: number;
  linked: number;
  notFound: number;
  problems: AuthorLookupProblem[];
};

export type AuthorLinkingStatus = { linkable: number; lookup: number; run: AuthorLinkingRun | null };

export const adminApi = {
  getStorageUsage: async (): Promise<StorageUsage> => {
    const res = await fetch(`${apiBase()}/admin/storage`, { headers: authHeaders() });
    assertOk(res, "Failed to load storage usage");
    return res.json();
  },

  inviteUser: async (email: string): Promise<{ email: string; expires_at: string; expires_in_days: number }> => {
    const res = await fetch(`${apiBase()}/admin/invitations`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to send the invitation"));
    return res.json();
  },

  listUsers: async (): Promise<AdminUser[]> => {
    const res = await fetch(`${apiBase()}/admin/users`, { headers: authHeaders() });
    assertOk(res, "Failed to load users");
    return res.json();
  },

  getOverview: (): Promise<AdminOverview> => adminRequest("GET", "/admin/overview", "Failed to load the overview"),

  createUser: (input: CreateUserInput): Promise<{ id: string; email: string; generated_password: string | null }> =>
    adminRequest("POST", "/admin/users", "Failed to create the user", input),

  updateUser: (id: string, patch: UpdateUserInput): Promise<{ ok: true }> =>
    adminRequest("PATCH", `/admin/users/${id}`, "Failed to update the user", patch),

  signOutUser: (id: string, revokeTokens: boolean): Promise<{ ok: true; revoked_tokens: number }> =>
    adminRequest("POST", `/admin/users/${id}/sign-out`, "Failed to sign the user out", { revoke_tokens: revokeTokens }),

  createResetLink: (id: string): Promise<{ url: string; expires_at: string }> =>
    adminRequest("POST", `/admin/users/${id}/reset-link`, "Failed to create the reset link", {}),

  deleteUser: (id: string): Promise<{ ok: true; deleted_models: number }> =>
    adminRequest("DELETE", `/admin/users/${id}`, "Failed to delete the user"),

  retryFailedProcessing: (): Promise<{ ok: true; retried: number }> =>
    adminRequest("POST", "/admin/processing/retry-failed", "Failed to retry processing", {}),

  getAuthorLinking: async (): Promise<AuthorLinkingStatus> => {
    const res = await fetch(`${apiBase()}/admin/triggers/link-authors`, { headers: authHeaders() });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to check for unlinked authors"));
    return res.json();
  },

  startAuthorLinking: async (): Promise<{ run: AuthorLinkingRun }> => {
    const res = await fetch(`${apiBase()}/admin/triggers/link-authors`, { method: "POST", headers: authHeaders() });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to start linking authors"));
    return res.json();
  },

  deleteAllPrintsForUser: async (userId: string): Promise<{ deleted: number }> => {
    const res = await fetch(`${apiBase()}/admin/users/${userId}/delete-all-prints`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to delete models"));
    return res.json();
  },

  listLogs: async (filter: { userId?: string; from?: string; to?: string }): Promise<LogEntry[]> => {
    const params = new URLSearchParams();
    if (filter.userId) params.set("user_id", filter.userId);
    if (filter.from) params.set("from", filter.from);
    if (filter.to) params.set("to", filter.to);
    const qs = params.toString();
    const res = await fetch(`${apiBase()}/admin/logs${qs ? `?${qs}` : ""}`, { headers: authHeaders() });
    assertOk(res, "Failed to load logs");
    return res.json();
  },
};
