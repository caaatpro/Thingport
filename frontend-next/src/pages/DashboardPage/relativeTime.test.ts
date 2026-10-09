import { describe, expect, it } from "vitest";
import { relativeTime } from "./relativeTime";

const NOW = new Date("2026-01-10T12:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("relativeTime", () => {
  it("picks the unit and pluralises", () => {
    expect(relativeTime(ago(10_000), NOW)).toBe("Just now");
    expect(relativeTime(ago(60_000), NOW)).toBe("1 minute ago");
    expect(relativeTime(ago(5 * 60_000), NOW)).toBe("5 minutes ago");
    expect(relativeTime(ago(3 * 3_600_000), NOW)).toBe("3 hours ago");
    expect(relativeTime(ago(24 * 3_600_000), NOW)).toBe("1 day ago");
    expect(relativeTime(ago(72 * 3_600_000), NOW)).toBe("3 days ago");
  });
});
