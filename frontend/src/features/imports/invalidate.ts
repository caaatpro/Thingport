import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LIBRARY_QUERY_PREFIXES } from "./logic";

/** Call after anything that adds models, so every list that can show them refetches. */
export function useInvalidateLibrary(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all(LIBRARY_QUERY_PREFIXES.map((prefix) => queryClient.invalidateQueries({ queryKey: [prefix] })));
  }, [queryClient]);
}
