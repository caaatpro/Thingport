import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, Download, MoreVertical } from "lucide-react";
import { collectionsApi } from "@/api/collections";
import type { PrintSortMode } from "@/api/prints";
import { tagsApi } from "@/api/tags";
import { errorMessage } from "@/app/queryClient";
import {
  DownloadZipConfirmDialog,
  ModelGrid,
  ModelGridEmpty,
  ModelGridSkeleton,
  SortSegmented,
  ViewToggle,
  usePrintList,
  useViewMode,
} from "@/features/prints";
import { Alert, Button, IconButton, Menu, MenuItem, PageHeader, Spinner, useToast } from "@/ui";
import { CollectionCard } from "../CollectionsPage/CollectionCard";
import { collectionsWithTag } from "../CollectionsPage/order";
import { parseSort, withSort } from "../CollectionDetailPage/sort";

function TagBookmarkButton({ tag }: { tag: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const bookmarks = useQuery({ queryKey: ["tags", "bookmarked"], queryFn: () => tagsApi.listBookmarked() });
  const bookmarked = bookmarks.data?.includes(tag) ?? false;
  const toggle = useMutation({
    mutationFn: () => (bookmarked ? tagsApi.unbookmark(tag) : tagsApi.bookmark(tag)),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tags"] }),
        queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
      ]),
    onError: (err) => toast.error(errorMessage(err, "Couldn't update the bookmark. Try again.")),
  });
  return (
    <IconButton
      label={bookmarked ? "Remove bookmark" : "Bookmark tag"}
      variant="outline"
      aria-pressed={bookmarked}
      disabled={bookmarks.isPending || toggle.isPending}
      onClick={() => toggle.mutate()}
    >
      {bookmarked ? (
        <BookmarkCheck className="size-4 text-accent-text" aria-hidden />
      ) : (
        <Bookmark className="size-4" aria-hidden />
      )}
    </IconButton>
  );
}

/** Models with this tag, preceded by collections carrying it. */
export default function TagDetailPage() {
  const { tagName = "" } = useParams<{ tagName: string }>();
  // React Router has already decoded the param.
  const tag = tagName;
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = parseSort(searchParams.get("orderBy"));
  const [view, setView] = useViewMode();
  const [downloadOpen, setDownloadOpen] = useState(false);

  const list = usePrintList({ tag, order_by: sort, enabled: Boolean(tag) });
  const { sentinelRef, isFetchingNextPage } = list;
  const allCollections = useQuery({
    queryKey: ["collections"],
    queryFn: () => collectionsApi.list(),
    enabled: Boolean(tag),
  });
  const collections = useMemo(() => collectionsWithTag(allCollections.data ?? [], tag), [allCollections.data, tag]);

  const setSort = (mode: PrintSortMode) => setSearchParams((prev) => withSort(prev, mode));

  const actions = (
    <>
      <TagBookmarkButton tag={tag} />
      <Menu
        trigger={
          <IconButton label="More" variant="outline">
            <MoreVertical className="size-4" aria-hidden />
          </IconButton>
        }
      >
        <MenuItem icon={<Download />} onSelect={() => setDownloadOpen(true)}>
          Download all as zip
        </MenuItem>
      </Menu>
    </>
  );

  const nothing = !list.isLoading && list.items.length === 0 && collections.length === 0;

  return (
    <>
      <PageHeader title={tag} subtitle="Tag" backTo="/models/tags" backLabel="Back to tags" actions={actions} />

      <div className="mb-5 flex flex-wrap items-center justify-end gap-2">
        <SortSegmented value={sort} onChange={setSort} />
        <ViewToggle value={view} onChange={setView} />
      </div>

      {collections.length > 0 ? (
        <section aria-label="Collections with this tag" className="mb-6">
          <ul className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(min(236px,100%),1fr))]">
            {collections.map((collection) => (
              <li key={collection.id} className="min-w-0">
                <CollectionCard collection={collection} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
      ) : nothing ? (
        <ModelGridEmpty title="No models with this tag yet." />
      ) : (
        <>
          <ModelGrid items={list.items} view={view} />
          <div ref={sentinelRef} className="flex justify-center py-4">
            {isFetchingNextPage ? <Spinner label="Loading more" /> : null}
          </div>
        </>
      )}

      <DownloadZipConfirmDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        filter={{ tag }}
        filename={`${tag || "tag"}.zip`}
        title={`Download tag "${tag}" as zip`}
      />
    </>
  );
}
