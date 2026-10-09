import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES, type DefaultCategoryNode } from "./defaultCategories";

// Validates the static starter tree against the constraints enforced on real categories.

function flatten(nodes: DefaultCategoryNode[], depth = 0): Array<{ node: DefaultCategoryNode; depth: number }> {
  return nodes.flatMap((node) => [{ node, depth }, ...flatten(node.children ?? [], depth + 1)]);
}

function duplicateSiblingNames(nodes: DefaultCategoryNode[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const node of nodes) {
    if (seen.has(node.name)) dupes.push(node.name);
    seen.add(node.name);
    if (node.children) dupes.push(...duplicateSiblingNames(node.children));
  }
  return dupes;
}

describe("DEFAULT_CATEGORIES", () => {
  const all = flatten(DEFAULT_CATEGORIES);

  it("is non-empty", () => {
    expect(DEFAULT_CATEGORIES.length).toBeGreaterThan(0);
  });

  it("gives every node a non-empty name", () => {
    for (const { node } of all) {
      expect(node.name.trim()).not.toBe("");
    }
  });

  it("has no duplicate names among siblings", () => {
    expect(duplicateSiblingNames(DEFAULT_CATEGORIES)).toEqual([]);
  });

  it("only uses positive whole-number category ids, matching routes/categories.ts's parseCatIdsInput rules", () => {
    for (const { node } of all) {
      for (const ids of [node.makerworldCatIds, node.thingiverseCatIds, node.printablesCatIds]) {
        for (const id of ids ?? []) {
          expect(Number.isSafeInteger(id)).toBe(true);
          expect(id).toBeGreaterThan(0);
        }
      }
    }
  });
});
