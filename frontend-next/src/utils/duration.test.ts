import { describe, expect, it } from "vitest";
import { formatPreparedDuration } from "./duration";

describe("formatPreparedDuration", () => {
  it("is null for nothing or less than a second", () => {
    expect(formatPreparedDuration(null)).toBeNull();
    expect(formatPreparedDuration(undefined)).toBeNull();
    expect(formatPreparedDuration(0)).toBeNull();
    expect(formatPreparedDuration(0.4)).toBeNull();
  });

  it("rounds up to at least one minute", () => {
    expect(formatPreparedDuration(10)).toBe("1 min");
  });

  it("splits into days, hours and minutes and drops empty parts", () => {
    expect(formatPreparedDuration(1 * 86400 + 2 * 3600 + 3 * 60)).toBe("1 d 2 h 3 min");
    expect(formatPreparedDuration(2 * 3600)).toBe("2 h");
  });
});
