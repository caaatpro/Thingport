import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useViewMode, VIEW_MODE_KEY } from "./useViewMode";

afterEach(() => vi.restoreAllMocks());

describe("useViewMode", () => {
  it("defaults to grid and remembers the choice under the library key", () => {
    const { result, unmount } = renderHook(() => useViewMode());
    expect(result.current[0]).toBe("grid");
    act(() => result.current[1]("list"));
    expect(result.current[0]).toBe("list");
    expect(window.localStorage.getItem(VIEW_MODE_KEY)).toBe("list");
    expect(VIEW_MODE_KEY).toBe("thingport.library.view");
    unmount();
    expect(renderHook(() => useViewMode()).result.current[0]).toBe("list");
  });

  it("still works when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useViewMode());
    expect(result.current[0]).toBe("grid");
    act(() => result.current[1]("list"));
    expect(result.current[0]).toBe("list");
  });
});
