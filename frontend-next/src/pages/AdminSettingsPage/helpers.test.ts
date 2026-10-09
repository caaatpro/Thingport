import { describe, expect, it } from "vitest";
import { addToken, describeDuration, renderExamples } from "./helpers";

describe("storage template helpers", () => {
  it("inserts a placeholder before the filename", () => {
    expect(addToken("{category}/{filename}", "model")).toBe("{category}/{model}/{filename}");
  });
  it("appends after a trailing slash or at the end", () => {
    expect(addToken("{category}/", "model")).toBe("{category}/{model}");
    expect(addToken("{category}", "model")).toBe("{category}/{model}");
    expect(addToken("", "model")).toBe("{model}");
  });
  it("never adds a second filename", () => {
    expect(addToken("{model}/{filename}", "filename")).toBe("{model}/{filename}");
  });
  it("previews both plates of an example print", () => {
    expect(renderExamples(" {model}/{filename} ")).toEqual(["Cable clip/Cable clip.3mf", "Cable clip/Cable clip-2.3mf"]);
    expect(renderExamples("  ")).toEqual([]);
  });
});

describe("describeDuration", () => {
  it("picks the largest fitting unit", () => {
    expect(describeDuration(43200)).toBe("12 hours");
    expect(describeDuration(90000)).toBe("1 day");
    expect(describeDuration(300)).toBe("5 minutes");
    expect(describeDuration(30)).toBeNull();
  });
});
