import type { Collection } from "@/api/collections";
import { hasRole } from "@/utils/access";

/** What the viewer may do in a collection. Built-in collections (Favorites, History) never offer any of it. */
export function collectionAccess(collection: Collection) {
  const system = Boolean(collection.system_key);
  return {
    system,
    canUpload: !system && hasRole(collection.my_role, "upload"),
    canEdit: !system && hasRole(collection.my_role, "edit"),
    // Sharing is owner-only; an older backend sends no `is_owner`, which means "yours".
    canShare: !system && collection.is_owner !== false,
    canDelete: !system && hasRole(collection.my_role, "owner"),
  };
}

/** "Shared by Ann · Can upload", or null for the owner's own collections. */
export function sharedByLabel(collection: Collection): string | null {
  if (collection.is_owner !== false || !collection.owner) return null;
  return `Shared by ${collection.owner.display_name} · Can ${collection.my_role ?? "view"}`;
}
