import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { collectionsApi, type CollectionMembership } from "@/api/collections";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Modal, PageLoading, cn } from "@/ui";
import { useInvalidatePrints } from "./queryKeys";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  printId: string;
};

/** Each chip click toggles membership immediately; there's no save step. */
export function AddToCollectionDialog({ open, onOpenChange, printId }: Props) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidatePrints();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const queryKey = ["collections", "for-print", printId];

  const memberships = useQuery({
    queryKey,
    queryFn: () => collectionsApi.listForPrint(printId),
    enabled: open,
    // Always fresh when the dialog opens.
    staleTime: 0,
  });

  const toggle = useMutation({
    mutationFn: async (collection: CollectionMembership) => {
      const nextIn = !collection.in_collection;
      if (nextIn) await collectionsApi.addItem(collection.id, printId);
      else await collectionsApi.removeItem(collection.id, printId);
      return { id: collection.id, nextIn };
    },
    onMutate: (collection) => setPendingId(collection.id),
    onSuccess: ({ id, nextIn }) => {
      queryClient.setQueryData<CollectionMembership[]>(queryKey, (prev) =>
        prev?.map((c) => (c.id === id ? { ...c, in_collection: nextIn } : c)),
      );
      void invalidate();
    },
    onSettled: () => setPendingId(null),
  });

  const error = toggle.error
    ? errorMessage(toggle.error, "Couldn't update collections. Try again.")
    : memberships.error
      ? errorMessage(memberships.error, "Couldn't load collections. Try again.")
      : null;
  const collections = memberships.data;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add to collection"
      size="sm"
      footer={<Button onClick={() => onOpenChange(false)}>Close</Button>}
    >
      <div className="flex flex-col gap-3">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {collections === undefined && !memberships.error ? <PageLoading className="py-6" /> : null}
        {collections?.length === 0 ? <p className="text-sm text-muted">You don't have any collections yet.</p> : null}
        {collections && collections.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.in_collection}
                disabled={pendingId === c.id}
                onClick={() => !pendingId && toggle.mutate(c)}
                className={cn(
                  "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-sm transition-colors disabled:opacity-60",
                  c.in_collection
                    ? "border-accent bg-accent-soft text-accent-text"
                    : "border-border-strong bg-surface text-fg hover:bg-surface-2",
                )}
              >
                {pendingId === c.id ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : c.in_collection ? (
                  <Check className="size-3.5" aria-hidden />
                ) : null}
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
