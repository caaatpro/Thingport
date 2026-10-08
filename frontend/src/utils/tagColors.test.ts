import { describe, expect, it } from "vitest";
import { colorForTag } from "./tagColors";

describe("colorForTag", () => {
  it("is stable for the same tag and ignores case", () => {
    expect(colorForTag("Benchy")).toEqual(colorForTag("benchy"));
    expect(colorForTag("benchy")).toEqual(colorForTag("benchy"));
  });

  it("always returns a complete colour triple", () => {
    for (const tag of ["", "a", "storage", "ЭЛЕКТРОНИКА", "a very long tag with spaces 123"]) {
      const c = colorForTag(tag);
      expect(c.bg).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.text).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.border).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("spreads different tags over more than one colour", () => {
    const colours = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((t) => colorForTag(t).bg));
    expect(colours.size).toBeGreaterThan(3);
  });
});
