import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkMinus, Download, MoreVertical, Pencil, Share2, Trash2 } from "lucide-react";
import { collectionsApi, type Collection, type CollectionInput } from "@/api/collections";
import { errorMessage } from "@/app/queryClient";
import { DownloadZipConfirmDialog } from "@/features/prints";
import { ShareDialog } from "@/features/sharing/ShareDialog";
import { IconButton, Menu, MenuItem, MenuSeparator, useConfirm, useToast } from "@/ui";
import { CollectionFormDialog } from "../CollectionsPage/CollectionFormDialog";
import { collectionAccess } from "./access";
import { useCollectionBookmark } from "./useCollectionBookmark";

const SHARE_HINT =
  "Everyone you pick sees every model in this collection, including models you add to it later. They can view and download them, but not change them.";

type Props = {
  collection: Collection;
  /** Called after the collection was deleted (the detail page leaves, the list just refreshes). */
  onDeleted?: () => void;
  /** Lighter styling for use over a cover image. */
  overlay?: boolean;
};

/** The "More" menu of a collection, shared by the detail header and the list cards. Items depend on the viewer's role. */
export function CollectionActionsMenu({ collection, onDeleted, overlay }: Props) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const bookmark = useCollectionBookmark(collection);
  const access = collectionAccess(collection);
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["collections"] }),
      queryClient.invalidateQueries({ queryKey: ["collection", collection.id] }),
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
    ]);

  const update = useMutation({
    mutationFn: (input: CollectionInput) => collectionsApi.update(collection.id, input),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: () => collectionsApi.delete(collection.id),
    onSuccess: async () => {
      // The detail query would 404 if refetched, so drop it instead.
      queryClient.removeQueries({ queryKey: ["collection", collection.id] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["collections"] }),
        queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
      ]);
      onDeleted?.();
    },
    onError: (err) => toast.error(errorMessage(err, "Couldn't delete the collection.")),
  });

  const askDelete = async () => {
    const ok = await confirm({
      title: "Delete collection",
      message: `Delete "${collection.name}"? Models in it are not deleted.`,
      destructive: true,
    });
    if (ok) remove.mutate();
  };

  return (
    <>
      <Menu
        trigger={
          <IconButton label="More" variant={overlay ? "overlay" : "outline"} disabled={remove.isPending}>
            <MoreVertical className="size-4" aria-hidden />
          </IconButton>
        }
      >
        <MenuItem icon={bookmark.bookmarked ? <BookmarkMinus /> : <Bookmark />} disabled={bookmark.pending} onSelect={bookmark.toggle}>
          {bookmark.label}
        </MenuItem>
        <MenuItem icon={<Download />} onSelect={() => setDownloadOpen(true)}>
          Download all as zip
        </MenuItem>
        {access.canEdit || access.canShare || access.canDelete ? <MenuSeparator /> : null}
        {access.canEdit ? (
          <MenuItem icon={<Pencil />} onSelect={() => setEditOpen(true)}>
            Edit
          </MenuItem>
        ) : null}
        {access.canShare ? (
          <MenuItem icon={<Share2 />} onSelect={() => setShareOpen(true)}>
            Share…
          </MenuItem>
        ) : null}
        {access.canDelete ? (
          <MenuItem icon={<Trash2 />} danger onSelect={() => void askDelete()}>
            Delete
          </MenuItem>
        ) : null}
      </Menu>

      {editOpen ? (
        <CollectionFormDialog collection={collection} onClose={() => setEditOpen(false)} onSubmit={(input) => update.mutateAsync(input).then(() => undefined)} />
      ) : null}

      <DownloadZipConfirmDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        filter={{ collection_id: collection.id }}
        filename={`${collection.name || "collection"}.zip`}
        title={`Download "${collection.name}" as zip`}
      />

      {access.canShare ? (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          name={collection.name}
          hint={SHARE_HINT}
          loadShares={() => collectionsApi.listShares(collection.id)}
          saveShares={(ids, roles) => collectionsApi.setShares(collection.id, ids, roles)}
          withRoles
          onSaved={() => void refresh()}
        />
      ) : null}
    </>
  );
}
