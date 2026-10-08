import { describe, expect, it } from "vitest";
import type { Category } from "../api/categories";
import { ancestorPath, buildCategoryTree, flattenCategoryTree, subtreeIds } from "./categoryTree";

const cat = (id: string, name: string, parent_id: string | null = null, position = 0) =>
  ({ id, name, parent_id, position }) as Category;

const sample = [
  cat("art", "Art", null, 1),
  cat("tools", "Tools", null, 0),
  cat("paint", "Painting", "art", 1),
  cat("sculpt", "Sculpture", "art", 0),
  cat("clay", "Clay", "sculpt"),
];

describe("buildCategoryTree", () => {
  it("orders roots and children by position, then name", () => {
    const tree = buildCategoryTree(sample);
    expect(tree.roots.map((c) => c.id)).toEqual(["tools", "art"]);
    expect(tree.childrenByParent.art.map((c) => c.id)).toEqual(["sculpt", "paint"]);
    expect(tree.childrenByParent.sculpt.map((c) => c.id)).toEqual(["clay"]);
    expect(tree.childrenByParent.tools).toBeUndefined();
  });

  it("breaks ties on position by name", () => {
    const tree = buildCategoryTree([cat("b", "Beta"), cat("a", "Alpha")]);
    expect(tree.roots.map((c) => c.name)).toEqual(["Alpha", "Beta"]);
  });

  it("treats a category whose parent is missing as a root so nothing disappears", () => {
    const tree = buildCategoryTree([cat("orphan", "Orphan", "gone")]);
    expect(tree.roots.map((c) => c.id)).toEqual(["orphan"]);
  });

  it("indexes categories by id", () => {
    expect(buildCategoryTree(sample).byId.get("clay")?.name).toBe("Clay");
  });
});

describe("subtreeIds", () => {
  it("returns the category and everything beneath it", () => {
    const tree = buildCategoryTree(sample);
    expect(subtreeIds(tree, "art").toSorted()).toEqual(["art", "clay", "paint", "sculpt"]);
    expect(subtreeIds(tree, "clay")).toEqual(["clay"]);
  });
});

describe("ancestorPath", () => {
  it("lists ancestors root first, ending with the category", () => {
    expect(ancestorPath(buildCategoryTree(sample), "clay")).toEqual(["art", "sculpt", "clay"]);
  });

  it("stops at a cycle instead of looping forever", () => {
    const looped = buildCategoryTree([cat("a", "A", "b"), cat("b", "B", "a")]);
    expect(ancestorPath(looped, "a").toSorted()).toEqual(["a", "b"]);
  });

  it("is empty for an unknown id", () => {
    expect(ancestorPath(buildCategoryTree(sample), "nope")).toEqual([]);
  });
});

describe("flattenCategoryTree", () => {
  it("walks depth first with depths", () => {
    const flat = flattenCategoryTree(buildCategoryTree(sample)).map((f) => [f.category.id, f.depth]);
    expect(flat).toEqual([
      ["tools", 0],
      ["art", 0],
      ["sculpt", 1],
      ["clay", 2],
      ["paint", 1],
    ]);
  });

  it("leaves out the children of collapsed ids", () => {
    const flat = flattenCategoryTree(buildCategoryTree(sample), new Set(["art"])).map((f) => f.category.id);
    expect(flat).toEqual(["tools", "art"]);
  });
});
