import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { categoriesApi, type Category, type CategoryMetaInput } from "@/api/categories";
import { errorMessage } from "@/app/queryClient";
import { useToast } from "@/ui";

/**
 * Category writes for the manager. Each returns a promise that never rejects (failures are toasted), except
 * `updateMeta`, which rethrows so the details dialog can show the error beside the user's edits.
 * Every write refreshes the categories and the model lists (a delete moves models to Unassigned).
 */
export function useCategoryActions(categories: Category[], onDeleted: (id: string) => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["categories"] }),
      queryClient.invalidateQueries({ queryKey: ["prints"] }),
    ]);

  const create = useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId: string | null }) =>
      categoriesApi.create(name, [], parentId || undefined),
    onSuccess: refresh,
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => {
      const existing = categories.find((c) => c.id === id);
      return categoriesApi.update(id, name, existing?.tags ?? [], existing?.parent_id || undefined);
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => categoriesApi.delete(id),
    onSuccess: async (_data, id) => {
      onDeleted(id);
      await refresh();
    },
  });
  // Refetch even on failure: the manager shows a drop optimistically until fresh categories arrive.
  const reorder = useMutation({ mutationFn: (ids: string[]) => categoriesApi.reorder(ids), onSettled: refresh });
  const move = useMutation({
    mutationFn: ({ id, parentId, position }: { id: string; parentId: string | null; position: number }) =>
      categoriesApi.move(id, parentId, position),
    onSettled: refresh,
  });
  const meta = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CategoryMetaInput }) => categoriesApi.updateMeta(id, input),
    onSuccess: refresh,
  });

  return useMemo(() => {
    const attempt = async (run: () => Promise<unknown>, failure: string): Promise<boolean> => {
      try {
        await run();
        return true;
      } catch (err) {
        toast.error(errorMessage(err, failure));
        return false;
      }
    };
    return {
      create: (name: string, parentId: string | null) =>
        attempt(() => create.mutateAsync({ name, parentId }), "Couldn't create the category. Try again."),
      rename: (id: string, name: string) =>
        attempt(() => rename.mutateAsync({ id, name }), "Couldn't rename the category. Try again."),
      remove: (id: string) => attempt(() => remove.mutateAsync(id), "Couldn't delete the category. Try again."),
      reorder: (ids: string[]) => attempt(() => reorder.mutateAsync(ids), "Couldn't reorder categories. Try again."),
      move: (id: string, parentId: string | null, position: number) =>
        attempt(() => move.mutateAsync({ id, parentId, position }), "Couldn't move the subcategory. Try again."),
      updateMeta: (id: string, input: CategoryMetaInput) => meta.mutateAsync({ id, input }),
    };
    // The mutation objects change identity each render; `mutateAsync` of each is stable.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [
    toast,
    create.mutateAsync,
    rename.mutateAsync,
    remove.mutateAsync,
    reorder.mutateAsync,
    move.mutateAsync,
    meta.mutateAsync,
  ]);
}

export type CategoryActions = ReturnType<typeof useCategoryActions>;
