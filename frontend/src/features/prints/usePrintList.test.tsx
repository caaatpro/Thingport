import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AnyFn } from "@/test/types";
import { makePrint } from "./testUtils";

const list = vi.hoisted(() => vi.fn<AnyFn>());
vi.mock("@/api/prints", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/api/prints")>();
  return { ...original, printsApi: { ...original.printsApi, list } };
});

const { usePrintList, PAGE_SIZE } = await import("./usePrintList");

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("usePrintList", () => {
  it("pages by offset, merges pages and drops duplicates", async () => {
    list
      .mockResolvedValueOnce({ items: [makePrint({ id: "a" }), makePrint({ id: "b" })], hasMore: true, nextOffset: 2 })
      .mockResolvedValueOnce({ items: [makePrint({ id: "b" }), makePrint({ id: "c" })], hasMore: false });
    const { result } = renderHook(() => usePrintList({ scope: "shared", tag: "benchy", order_by: "popular" }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.items.map((p) => p.id)).toEqual(["a", "b"]));
    expect(list).toHaveBeenCalledWith({
      scope: "shared",
      tags: ["benchy"],
      order_by: "popular",
      limit: PAGE_SIZE,
      offset: 0,
    });
    expect(result.current.hasNextPage).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items.map((p) => p.id)).toEqual(["a", "b", "c"]));
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 2, limit: PAGE_SIZE }));
    expect(result.current.hasNextPage).toBe(false);
  });
});
