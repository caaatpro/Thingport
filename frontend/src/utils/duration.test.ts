import { describe, expect, it } from "vitest";
import i18n from "../i18n";
import { formatPreparedDuration } from "./duration";

const t = i18n.t.bind(i18n);

describe("formatPreparedDuration", () => {
  it("is null for nothing or less than a second", () => {
    expect(formatPreparedDuration(t, null)).toBeNull();
    expect(formatPreparedDuration(t, undefined)).toBeNull();
    expect(formatPreparedDuration(t, 0)).toBeNull();
    expect(formatPreparedDuration(t, 0.4)).toBeNull();
  });

  it("rounds up to at least one minute", () => {
    expect(formatPreparedDuration(t, 10)).toMatch(/1/);
  });

  it("splits into days, hours and minutes and drops empty parts", () => {
    const text = formatPreparedDuration(t, 1 * 86400 + 2 * 3600 + 3 * 60)!;
    expect(text).toMatch(/1.*2.*3/);
    const hoursOnly = formatPreparedDuration(t, 2 * 3600)!;
    expect(hoursOnly).toMatch(/2/);
    expect(hoursOnly).not.toMatch(/\d.*\d/);
  });
});
