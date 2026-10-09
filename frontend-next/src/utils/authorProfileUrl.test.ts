import { describe, expect, it } from "vitest";
import { authorProfileUrl } from "./authorProfileUrl";

describe("authorProfileUrl", () => {
  it("builds MakerWorld profiles from the numeric id, since its links are bio links", () => {
    expect(authorProfileUrl({ provider: "makerworld", external_id: "42", links: ["https://bio.example"] })).toBe(
      "https://makerworld.com/en/u/42",
    );
  });

  it("uses the first stored link for the other sites", () => {
    expect(
      authorProfileUrl({ provider: "printables", external_id: "7", links: ["https://www.printables.com/@maker", "x"] }),
    ).toBe("https://www.printables.com/@maker");
  });

  it("is null when there is nothing to link to", () => {
    expect(authorProfileUrl({ provider: "thingiverse", external_id: "7", links: [] })).toBeNull();
  });
});
