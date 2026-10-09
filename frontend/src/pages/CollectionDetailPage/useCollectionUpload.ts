import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UnauthorizedError } from "@/api/client";
import { printsApi } from "@/api/prints";
import { errorMessage } from "@/app/queryClient";
import { useToast } from "@/ui";

/**
 * Adds files to a collection, one model per file (the server files each into the collection and needs the
 * upload role or better). A failed file doesn't stop the rest; failures are reported together.
 */
export function useCollectionUpload(collectionId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: async (files: File[]) => {
      const failed: string[] = [];
      for (const file of files) {
        try {
          await printsApi.upload([file], { collection_id: collectionId });
        } catch (err) {
          // Rethrown so the query client signs the user out once.
          if (err instanceof UnauthorizedError) throw err;
          failed.push(file.name);
        }
      }
      return { failed, total: files.length };
    },
    onSuccess: ({ failed, total }) => {
      if (failed.length) toast.error(`Some files could not be uploaded: ${failed.join(", ")}`);
      else toast.success(total === 1 ? "Model uploaded" : `${total} models uploaded`);
    },
    onError: (err) => toast.error(errorMessage(err, "Upload failed. Try again.")),
    onSettled: () =>
      Promise.all(
        [["prints"], ["collection", collectionId], ["collections"]].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
  return {
    upload: (files: File[]) => (files.length ? mutation.mutate(files) : undefined),
    uploading: mutation.isPending,
  };
}
