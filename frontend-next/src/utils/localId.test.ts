import { afterEach, describe, expect, it, vi } from "vitest";
import { localId } from "./localId";

afterEach(() => vi.unstubAllGlobals());

describe("localId", () => {
  it("uses crypto.randomUUID when it exists", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "uuid-123" });
    expect(localId()).toBe("uuid-123");
  });

  // Plain-HTTP LAN origins have no randomUUID; this is the bug that broke file selection in the edit dialog.
  it("falls back to getRandomValues over plain HTTP", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(255);
        return bytes;
      },
    });
    expect(localId()).toBe("ff".repeat(16));
  });

  it("falls back to Math.random when there is no crypto at all", () => {
    vi.stubGlobal("crypto", undefined);
    expect(localId()).toMatch(/^id-[a-z0-9]+-[a-z0-9]+$/);
  });

  it("produces distinct ids", () => {
    vi.stubGlobal("crypto", undefined);
    expect(localId()).not.toBe(localId());
  });
});
