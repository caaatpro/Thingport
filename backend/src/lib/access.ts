import type { CollectionRole } from "../generated/prisma/client";

export type AccessRole = "owner" | "view" | "upload" | "edit" | "delete";

export function accessRoleOf(isOwner: boolean, role: CollectionRole | null | undefined): AccessRole {
  if (isOwner) return "owner";
  return role ? (role.toLowerCase() as AccessRole) : "view";
}
