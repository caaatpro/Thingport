import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { UnauthorizedError } from "../api/client";

/**
 * Server state lives in React Query. A 401 from any query or mutation signs the user out once, centrally,
 * so components never pass an `onUnauthorized` callback around.
 *
 * Invalidation convention (prefix keys): ["prints"], ["print", id], ["collections"], ["collection", id],
 * ["categories"], ["tags"], ["bookmarks"], ["notifications"], ["dashboard"], ["authors"], ["author", id],
 * ["admin", …], ["settings", …]. After changing something, invalidate the prefix of every list that shows it.
 */
export function createQueryClient(onUnauthorized: () => void): QueryClient {
  const handle = (error: unknown) => {
    if (error instanceof UnauthorizedError) onUnauthorized();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError: handle }),
    mutationCache: new MutationCache({ onError: handle }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => !(error instanceof UnauthorizedError) && count < 1,
      },
    },
  });
}

/** The message to show for a failed request: the server's own text when it sent one. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
