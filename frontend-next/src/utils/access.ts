import type { AccessRole } from "../api/prints";

const RANK: Record<AccessRole, number> = { view: 0, upload: 1, edit: 2, delete: 3, owner: 4 };

/** True when `role` is at least `min`. A missing role means a plain owner (older responses, own data). */
export function hasRole(role: AccessRole | undefined, min: AccessRole): boolean {
  return RANK[role ?? "owner"] >= RANK[min];
}
