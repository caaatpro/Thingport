import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { printsApi, type Print } from "@/api/prints";
import { errorMessage } from "@/app/queryClient";
import { useToast } from "@/ui";
import { useInvalidatePrints } from "./queryKeys";

/** Optimistic and rolled back on failure: the star's pop only plays on a false -> true prop change while mounted. */
export function useFavoriteToggle(print: Print) {
  const toast = useToast();
  const invalidate = useInvalidatePrints();
  const [isFavorite, setIsFavorite] = useState(print.is_favorite);
  const pendingRef = useRef(false);

  useEffect(() => {
    setIsFavorite(print.is_favorite);
  }, [print.is_favorite]);

  const mutation = useMutation({
    mutationFn: (next: boolean) => (next ? printsApi.favorite(print.id) : printsApi.unfavorite(print.id)),
  });

  const toggle = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    const next = !isFavorite;
    setIsFavorite(next);
    try {
      const updated = await mutation.mutateAsync(next);
      void invalidate();
      toast[updated.is_favorite ? "success" : "info"](
        `${updated.is_favorite ? "Added" : "Removed"} "${updated.title || updated.name}" ${updated.is_favorite ? "to" : "from"} Favourites`,
      );
    } catch (err) {
      setIsFavorite(!next);
      toast.error(errorMessage(err, "Couldn't update favourites. Try again."));
    } finally {
      pendingRef.current = false;
    }
  };

  const label = isFavorite ? "Remove from Favourites" : "Add to Favourites";
  return { isFavorite, toggle, label };
}
