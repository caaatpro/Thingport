import { useQueryClient } from "@tanstack/react-query";

/** Every list that can show a print or data derived from it (counts, covers, sharing badges). */
export const PRINT_QUERY_PREFIXES = ["prints", "print", "collections", "collection", "dashboard"] as const;

/** Returns a function that invalidates all of them; call it after any model mutation. */
export function useInvalidatePrints() {
  const queryClient = useQueryClient();
  return () => Promise.all(PRINT_QUERY_PREFIXES.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
}
