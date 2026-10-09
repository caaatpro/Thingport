import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Plus } from "lucide-react";
import { collectionsApi, type CollectionInput } from "@/api/collections";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, EmptyState, PageHeader, Skeleton } from "@/ui";
import { CollectionCard } from "./CollectionCard";
import { CollectionFormDialog } from "./CollectionFormDialog";
import { orderCollections } from "./order";

const GRID = "grid gap-5 grid-cols-[repeat(auto-fill,minmax(min(236px,100%),1fr))]";
const SKELETON_SLOTS = ["a", "b", "c", "d", "e", "f"];

export default function CollectionsPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const query = useQuery({ queryKey: ["collections"], queryFn: () => collectionsApi.list() });
  const collections = useMemo(() => orderCollections(query.data ?? []), [query.data]);

  const create = useMutation({
    mutationFn: (input: CollectionInput) => collectionsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["collections"] }),
  });

  const newButton = (
    <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
      New Collection
    </Button>
  );

  return (
    <>
      <PageHeader title="Collections" actions={newButton} />

      {query.isPending ? (
        <div aria-busy="true" aria-label="Loading collections" className={GRID}>
          {SKELETON_SLOTS.map((slot) => (
            <Skeleton key={slot} className="aspect-[4/3] h-auto rounded-card" />
          ))}
        </div>
      ) : query.isError ? (
        <Alert
          tone="danger"
          title="Couldn't load collections"
          action={
            <Button size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        >
          {errorMessage(query.error)}
        </Alert>
      ) : collections.length === 0 ? (
        <EmptyState icon={<FolderOpen />} title="No collections yet">
          Group models into a collection to find them together later.
        </EmptyState>
      ) : (
        <ul className={GRID}>
          {collections.map((collection) => (
            <li key={collection.id} className="min-w-0">
              <CollectionCard collection={collection} />
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <CollectionFormDialog
          onClose={() => setCreating(false)}
          onSubmit={(input) => create.mutateAsync(input).then(() => undefined)}
        />
      ) : null}
    </>
  );
}
