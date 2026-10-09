import { useCallback, useMemo } from "react";
import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { printsApi, type ListPrintsResult, type Print } from "@/api/prints";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";

export const PAGE_SIZE = 24;

type ListParams = NonNullable<Parameters<typeof printsApi.list>[0]>;

export type PrintListParams = Omit<ListParams, "limit" | "offset"> & {
  /** A single tag; merged into `tags`. */
  tag?: string;
  /** Pass false to hold off (e.g. until a route param is known). */
  enabled?: boolean;
};

const isProcessing = (print: Print) =>
  print.plates.some((p) => p.processing_status === "queued" || p.processing_status === "processing");

function anyProcessing(data: InfiniteData<ListPrintsResult> | undefined): boolean {
  return Boolean(data?.pages.some((page) => page.items.some(isProcessing)));
}

/**
 * Models, loaded a page at a time (offset pagination). Drop `sentinelRef` on an element at the end of the list
 * and the next page loads as it nears the viewport. Cards whose files are still processing refresh themselves.
 */
export function usePrintList(params: PrintListParams = {}) {
  const { enabled = true, tag, ...rest } = params;
  const filters = { ...rest, tags: tag ? [...(rest.tags ?? []), tag] : rest.tags };

  const query = useInfiniteQuery({
    queryKey: ["prints", "list", filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => printsApi.list({ ...filters, limit: PAGE_SIZE, offset: pageParam }),
    getNextPageParam: (last, pages) =>
      last.hasMore ? (last.nextOffset ?? pages.reduce((count, page) => count + page.items.length, 0)) : undefined,
    // Flip a freshly dropped model from a placeholder to its preview without a manual reload.
    refetchInterval: (q) => (anyProcessing(q.state.data) ? 3000 : false),
    enabled,
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const items = useMemo(() => {
    const seen = new Set<string>();
    // Offsets shift when a model is added or removed between pages, so the same model can show up twice.
    return (data?.pages.flatMap((page) => page.items) ?? []).filter((p) => !seen.has(p.id) && Boolean(seen.add(p.id)));
  }, [data]);
  const total = data?.pages[0]?.total;

  const loadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);
  const sentinelRef = useInfiniteScroll(loadMore, hasNextPage, isFetchingNextPage);

  return {
    items,
    /** Total matching models when the server reports it. */
    total,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    hasNextPage,
    isFetchingNextPage,
    /** Load the next page now (the sentinel does this on scroll). */
    loadMore,
    sentinelRef,
  };
}
