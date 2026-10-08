import type { Role } from "../generated/prisma/client";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: Role;
      /** Set when the request was authenticated with an API token rather than a session. */
      apiToken?: { id: string; scope: string };
    }
  }
}
