import { useMutation, useQueryClient } from "@tanstack/react-query";
import { collectionsApi, type Collection } from "@/api/collections";
import { errorMessage } from "@/app/queryClient";
import { useToast } from "@/ui";

/** Toggles a collection's bookmark and refreshes everything that shows it (lists, detail, sidebar). */
export function useCollectionBookmark(collection: Collection) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: () => (collection.bookmarked ? collectionsApi.unbookmark(collection.id) : collectionsApi.bookmark(collection.id)),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["collections"] }),
        queryClient.invalidateQueries({ queryKey: ["collection", collection.id] }),
        queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
      ]),
    onError: (err) => toast.error(errorMessage(err, "Couldn't update the bookmark. Try again.")),
  });
  return {
    bookmarked: collection.bookmarked,
    label: collection.bookmarked ? "Remove bookmark" : "Bookmark collection",
    toggle: () => mutation.mutate(),
    pending: mutation.isPending,
  };
}
