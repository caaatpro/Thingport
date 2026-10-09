import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./copyText";
import type { AnyFn } from "../test/types";

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
});

describe("copyText", () => {
  it("uses the async clipboard in a secure context", async () => {
    const writeText = vi.fn<AnyFn>().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    expect(await copyText("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  // A self-hosted instance is often plain HTTP on the LAN, where navigator.clipboard is unavailable.
  it("falls back to a hidden textarea over plain HTTP", async () => {
    vi.stubGlobal("navigator", {});
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    const exec = vi.fn<AnyFn>().mockReturnValue(true);
    document.execCommand = exec;
    expect(await copyText("secret link")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("reports failure when both routes fail", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn<AnyFn>().mockRejectedValue(new Error("denied")) } });
    document.execCommand = vi.fn<AnyFn>().mockReturnValue(false);
    expect(await copyText("x")).toBe(false);
  });
});
