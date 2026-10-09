import { describe, expect, it } from "vitest";
import { defaultCollectionSelection, toggleInSet } from "./selection";

describe("selection", () => {
  it("toggles without mutating the original set", () => {
    const base = new Set(["a"]);
    expect([...toggleInSet(base, "b")]).toEqual(["a", "b"]);
    expect([...toggleInSet(base, "a")]).toEqual([]);
    expect([...base]).toEqual(["a"]);
  });
  it("preselects only entries that are not yet in the library", () => {
    const picked = defaultCollectionSelection([
      { design_id: "1", already_imported: false },
      { design_id: "2", already_imported: true },
    ]);
    expect([...picked]).toEqual(["1"]);
  });
});
