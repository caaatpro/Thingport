import { authHeaders } from "../utils/auth";
import type { AuthUser } from "./auth";
import { apiBase, assertOk, readErrorMessage, UnauthorizedError } from "./client";
import type { Author } from "./prints";

export type { Author };

export const authorsApi = {
  get: async (id: string): Promise<Author> => {
    const res = await fetch(`${apiBase()}/author/${id}`, { headers: authHeaders() });
    assertOk(res, "Failed to load author");
    return res.json();
  },

  myLinks: async (): Promise<Author[]> => {
    const res = await fetch(`${apiBase()}/me/author-links`, { headers: authHeaders() });
    assertOk(res, "Failed to load linked authors");
    return res.json();
  },

  /** Throws on the backend's uniqueness rules, which the UI already hides the button for. */
  link: async (id: string): Promise<{ author: Author; user: AuthUser }> => {
    const res = await fetch(`${apiBase()}/author/${id}/link`, { method: "POST", headers: authHeaders() });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to link author"));
    return res.json();
  },
};
