import { describe, expect, it } from "vitest";
import type { Collection } from "@/api/collections";
import { collectionAccess, sharedByLabel } from "./access";

const base: Collection = {
  id: "c1",
  name: "Boxes",
  description: null,
  tags: [],
  item_count: 0,
  cover_items: [],
  created_at: "2026-01-01T00:00:00Z",
  system_key: null,
  bookmarked: false,
};
const shared = (my_role: Collection["my_role"]): Collection => ({
  ...base,
  is_owner: false,
  my_role,
  owner: { id: "u1", display_name: "Ann" },
});

describe("collectionAccess", () => {
  it("gives the owner everything, including when the backend sends no role", () => {
    expect(collectionAccess(base)).toMatchObject({ canUpload: true, canEdit: true, canShare: true, canDelete: true });
    expect(collectionAccess({ ...base, my_role: "owner", is_owner: true })).toMatchObject({ canDelete: true });
  });

  it.each([
    ["view", { canUpload: false, canEdit: false, canShare: false, canDelete: false }],
    ["upload", { canUpload: true, canEdit: false, canShare: false, canDelete: false }],
    ["edit", { canUpload: true, canEdit: true, canShare: false, canDelete: false }],
    ["delete", { canUpload: true, canEdit: true, canShare: false, canDelete: false }],
  ] as const)("limits a %s member", (role, expected) => {
    expect(collectionAccess(shared(role))).toMatchObject(expected);
  });

  it("offers nothing on built-in collections", () => {
    expect(collectionAccess({ ...base, id: "favorites", system_key: "favorites" })).toEqual({
      system: true,
      canUpload: false,
      canEdit: false,
      canShare: false,
      canDelete: false,
    });
  });
});

describe("sharedByLabel", () => {
  it("names the owner and the role", () => {
    expect(sharedByLabel(shared("upload"))).toBe("Shared by Ann · Can upload");
    expect(sharedByLabel(shared(undefined))).toBe("Shared by Ann · Can view");
  });
  it("is empty for your own collections", () => {
    expect(sharedByLabel(base)).toBeNull();
  });
});
