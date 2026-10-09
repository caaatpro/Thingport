import { useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { collectionsApi } from "@/api/collections";
import type { PrintSortMode } from "@/api/prints";
import { errorMessage } from "@/app/queryClient";
import {
  ModelGrid,
  ModelGridEmpty,
  ModelGridSkeleton,
  SortSegmented,
  ViewToggle,
  usePrintList,
  useViewMode,
} from "@/features/prints";
import { Alert, Badge, Button, PageHeader, PageLoading, Spinner } from "@/ui";
import { collectionDisplayName } from "@/utils/collectionDisplay";
import { CollectionActionsMenu } from "./CollectionActionsMenu";
import { CollectionBookmarkButton } from "./CollectionBookmarkButton";
import { collectionAccess, sharedByLabel } from "./access";
import { parseSort, withSort } from "./sort";
import { useCollectionUpload } from "./useCollectionUpload";

export default function CollectionDetailPage() {
  const { collectionId = "" } = useParams<{ collectionId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = parseSort(searchParams.get("orderBy"));
  const [view, setView] = useViewMode();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const { upload, uploading } = useCollectionUpload(collectionId);

  const collectionQuery = useQuery({
    queryKey: ["collection", collectionId],
    queryFn: () => collectionsApi.get(collectionId),
    enabled: Boolean(collectionId),
  });
  const collection = collectionQuery.data;
  const list = usePrintList({ collection_id: collectionId, order_by: sort, enabled: Boolean(collection) });
  const { sentinelRef, isFetchingNextPage } = list;

  const setSort = (mode: PrintSortMode) => setSearchParams((prev) => withSort(prev, mode));

  if (collectionQuery.isPending) return <PageLoading />;
  if (collectionQuery.isError || !collection) {
    return (
      <>
        <PageHeader title="Collection" backTo="/models/collections" backLabel="Back to collections" />
        <Alert
          tone="danger"
          title="Collection not found"
          action={
            <Button size="sm" onClick={() => void collectionQuery.refetch()}>
              Try again
            </Button>
          }
        >
          {errorMessage(collectionQuery.error, "It may have been deleted, or it isn't shared with you.")}
        </Alert>
      </>
    );
  }

  const access = collectionAccess(collection);
  const sharedBy = sharedByLabel(collection);

  const actions = access.system ? null : (
    <>
      {access.canUpload ? (
        <>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            data-testid="collection-upload-input"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              upload(files);
            }}
          />
          <Button
            variant="primary"
            loading={uploading}
            icon={<Upload className="size-4" aria-hidden />}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? "Uploading…" : "Upload models"}
          </Button>
        </>
      ) : null}
      <CollectionBookmarkButton collection={collection} />
      <CollectionActionsMenu collection={collection} onDeleted={() => navigate("/models/collections")} />
    </>
  );

  return (
    <>
      <PageHeader
        title={collectionDisplayName(collection)}
        subtitle="Collection"
        backTo="/models/collections"
        backLabel="Back to collections"
        actions={actions}
      />
      {collection.description ? (
        <p className="mb-4 max-w-3xl text-sm whitespace-pre-wrap text-muted">{collection.description}</p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">{sharedBy ? <Badge tone="outline">{sharedBy}</Badge> : null}</div>
        <div className="flex items-center gap-2">
          <SortSegmented value={sort} onChange={setSort} />
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {list.isLoading ? (
        <ModelGridSkeleton view={view} />
      ) : list.isError ? (
        <Alert
          tone="danger"
          title="Couldn't load models"
          action={
            <Button size="sm" onClick={() => void list.refetch()}>
              Try again
            </Button>
          }
        >
          {errorMessage(list.error)}
        </Alert>
      ) : list.items.length === 0 ? (
        <ModelGridEmpty title="No models in this collection yet." />
      ) : (
        <>
          <ModelGrid items={list.items} view={view} collectionId={access.system ? undefined : collection.id} />
          <div ref={sentinelRef} className="flex justify-center py-4">
            {isFetchingNextPage ? <Spinner label="Loading more" /> : null}
          </div>
        </>
      )}
    </>
  );
}
