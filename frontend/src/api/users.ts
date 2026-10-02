import { authHeaders } from "../utils/auth";
import { apiBase, readErrorMessage, UnauthorizedError } from "./client";
import type { DirectoryUser } from "./prints";

export const usersApi = {
  // Member directory for the sharing picker (excludes the current user).
  list: async (): Promise<DirectoryUser[]> => {
    const res = await fetch(`${apiBase()}/users`, { headers: authHeaders() });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to load users"));
    return res.json();
  },
};
