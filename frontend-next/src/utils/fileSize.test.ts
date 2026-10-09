import { describe, expect, it } from "vitest";
import { formatFileSize } from "./fileSize";

describe("formatFileSize", () => {
  it("shows bytes without decimals and larger units with one", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatFileSize(3.25 * 1024 ** 3)).toBe("3.3 GB");
  });

  it("stays in GB for very large sizes", () => {
    expect(formatFileSize(2048 * 1024 ** 3)).toBe("2048.0 GB");
  });

  it("returns an empty string for a missing size", () => {
    expect(formatFileSize(undefined as unknown as number)).toBe("");
    expect(formatFileSize(null as unknown as number)).toBe("");
  });
});
