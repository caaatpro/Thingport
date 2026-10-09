import { authHeaders } from "../utils/auth";
import { apiBase, readErrorMessage, UnauthorizedError } from "./client";

export type ApiToken = {
  id: string;
  name: string;
  /** First characters of the secret, to tell tokens apart. */
  prefix: string;
  scope: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
};

/** `token` is the secret and is only ever returned by create. */
export type CreatedApiToken = ApiToken & { token: string };

async function check(res: Response, fallback: string): Promise<void> {
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(await readErrorMessage(res, fallback));
}

export const tokensApi = {
  list: async (): Promise<ApiToken[]> => {
    const res = await fetch(`${apiBase()}/tokens`, { headers: authHeaders() });
    await check(res, "Failed to load API tokens");
    return res.json();
  },

  create: async (name: string, expiresInDays: number | null): Promise<CreatedApiToken> => {
    const res = await fetch(`${apiBase()}/tokens`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name, expires_in_days: expiresInDays }),
    });
    await check(res, "Failed to create the token");
    return res.json();
  },

  revoke: async (id: string): Promise<void> => {
    const res = await fetch(`${apiBase()}/tokens/${id}`, { method: "DELETE", headers: authHeaders() });
    await check(res, "Failed to revoke the token");
  },
};
