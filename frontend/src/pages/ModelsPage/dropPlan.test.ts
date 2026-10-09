import { describe, expect, it } from "vitest";
import type { Category } from "@/api/categories";
import { applyDrop, getProjection, planDrop, type FlatItem } from "./dropPlan";

const cat = (id: string, parent_id: string | null, position: number) =>
  ({ id, name: id, parent_id, position }) as Category;

// A (a1, a2), B (b1)
const items: FlatItem[] = [
  { id: "A", parentId: null, depth: 0 },
  { id: "a1", parentId: "A", depth: 1 },
  { id: "a2", parentId: "A", depth: 1 },
  { id: "B", parentId: null, depth: 0 },
  { id: "b1", parentId: "B", depth: 1 },
];
const siblings = { "": ["A", "B"], A: ["a1", "a2"], B: ["b1"] };

describe("getProjection", () => {
  it("refuses to drop above the first top-level category", () => {
    expect(getProjection(items, "a1", "A", 0)).toBeNull();
  });

  it("keeps a subcategory under the same parent when dropped within its siblings", () => {
    expect(getProjection(items, "a1", "a2", 0)).toEqual({ depth: 1, parentId: "A" });
  });

  it("re-parents when dropped onto another branch", () => {
    expect(getProjection(items, "a1", "b1", 0)).toEqual({ depth: 1, parentId: "B" });
  });
});

describe("planDrop", () => {
  it("is a reorder when the parent stays", () => {
    const plan = planDrop(items, siblings, "a1", "a2", { depth: 1, parentId: "A" });
    expect(plan).toMatchObject({ sameParent: true, siblingIds: ["a2", "a1"], position: 1 });
  });

  it("is a move to the right position when the parent changes", () => {
    const plan = planDrop(items, siblings, "a1", "b1", { depth: 1, parentId: "B" });
    expect(plan).toMatchObject({ sameParent: false, parentId: "B", siblingIds: ["b1", "a1"], position: 1 });
  });

  it("does nothing when dropped back where it was", () => {
    expect(planDrop(items, siblings, "a1", "a1", { depth: 1, parentId: "A" })).toBeNull();
  });
});

describe("applyDrop", () => {
  it("re-parents and renumbers the new siblings", () => {
    const list = [cat("B", null, 1), cat("b1", "B", 0), cat("a1", "A", 0)];
    const out = applyDrop(list, { id: "a1", parentId: "B", position: 0, siblingIds: ["a1", "b1"], sameParent: false });
    expect(out.find((c) => c.id === "a1")).toMatchObject({ parent_id: "B", position: 0 });
    expect(out.find((c) => c.id === "b1")?.position).toBe(1);
  });
});
