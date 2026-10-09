import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  ExternalLink,
  ListMinus,
  ListPlus,
  Loader2,
  MoreVertical,
  Pencil,
  Rocket,
  Share2,
  Trash2,
} from "lucide-react";
import { UnauthorizedError } from "@/api/client";
import { collectionsApi } from "@/api/collections";
import { printsApi, type Print } from "@/api/prints";
import { errorMessage } from "@/app/queryClient";
import { importProviderInfo } from "@/constants/importProviders";
import { ShareDialog } from "@/features/sharing/ShareDialog";
import { IconButton, Menu, MenuItem, MenuSeparator, useConfirm, useToast } from "@/ui";
import { hasRole } from "@/utils/access";
import { AddToCollectionDialog } from "./AddToCollectionDialog";
import { DownloadPickerDialog } from "./DownloadPickerDialog";
import { NormalizeInfoIcon } from "./NormalizeInfoIcon";
import { useInvalidatePrints } from "./queryKeys";
import { SlicerFileDialog } from "./SlicerFileDialog";
import { useDownloadPrint } from "./useDownloadPrint";
import { useNormalizedOpen } from "./useNormalizedOpen";
import { useOpenInSlicer } from "./useOpenInSlicer";

type Props = {
  print: Print;
  /** Only for a real collection; shows "Remove from collection". */
  collectionId?: string;
  /** Replaces the default "More actions" icon button. Must accept a ref. */
  trigger?: ReactNode;
  /** Look of the default trigger: `overlay` sits on top of a thumbnail. */
  variant?: "ghost" | "overlay";
  /** Called after the model was deleted (the detail page navigates away here). */
  onDeleted?: () => void;
  /** Lets a page open the share dialog from its own button. */
  shareOpen?: boolean;
  onShareOpenChange?: (open: boolean) => void;
};

/** Icon + label row for an item that renders its own element (a link). */
function ItemBody({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <>
      <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </>
  );
}

/** The "⋮" menu for a model, shared by the detail header, cards and rows. Permissions follow `access_role`. */
export function ModelActionsMenu({
  print,
  collectionId,
  trigger,
  variant = "ghost",
  onDeleted,
  shareOpen: shareOpenProp,
  onShareOpenChange,
}: Props) {
  const confirm = useConfirm();
  const toast = useToast();
  const queryClient = useQueryClient();
  const invalidate = useInvalidatePrints();
  const [menuOpen, setMenuOpen] = useState(false);
  const [addToCollectionOpen, setAddToCollectionOpen] = useState(false);
  const [slicerPickerOpen, setSlicerPickerOpen] = useState(false);
  const [normalizedPickerOpen, setNormalizedPickerOpen] = useState(false);
  const [shareOpenState, setShareOpenState] = useState(false);
  const shareOpen = shareOpenProp ?? shareOpenState;
  const setShareOpen = onShareOpenChange ?? setShareOpenState;
  const title = print.title || print.name;
  const isOwner = print.is_owner !== false;

  const download = useDownloadPrint(print);
  const { slicerOption, targets: slicerTargets, normalizedTargets } = useOpenInSlicer(print);
  const normalized = useNormalizedOpen(print.id, download.recordUse);

  const fail = (err: unknown, fallback: string) => {
    if (!(err instanceof UnauthorizedError)) toast.error(errorMessage(err, fallback));
  };

  const removeFromCollection = useMutation({
    mutationFn: () => collectionsApi.removeItem(collectionId ?? "", print.id),
    onSuccess: () => void invalidate(),
    onError: (err) => fail(err, "Couldn't remove it from the collection. Try again."),
  });
  const deletePrint = useMutation({
    mutationFn: () => printsApi.delete(print.id),
    onSuccess: () => {
      onDeleted?.();
      queryClient.removeQueries({ queryKey: ["print", print.id] });
      void invalidate();
    },
    onError: (err) => fail(err, "Couldn't delete the model. Try again."),
  });

  const handleRemoveFromCollection = async () => {
    const confirmed = await confirm({
      message: `Remove "${title}" from this collection?`,
      confirmLabel: "Remove",
    });
    if (confirmed) removeFromCollection.mutate();
  };

  const handleDelete = async () => {
    const confirmed = await confirm({ message: `Delete "${title}"? This cannot be undone.`, destructive: true });
    if (confirmed) deletePrint.mutate();
  };

  const providerInfo = importProviderInfo(print.source_provider);
  const singleNormalized = normalizedTargets.length === 1 ? normalizedTargets[0] : null;
  const normalizedState = singleNormalized ? normalized.stateOf(singleNormalized) : "idle";
  const normalizedLabel = (slicer: string) =>
    normalizedState === "preparing"
      ? "Preparing normalized file…"
      : normalizedState === "ready"
        ? `Ready – click to open in ${slicer}`
        : `Open normalized in ${slicer}`;

  const busy = deletePrint.isPending || removeFromCollection.isPending;
  const defaultTrigger = (
    <IconButton label="More actions" variant={variant} size="sm" disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MoreVertical className="size-4" aria-hidden />}
    </IconButton>
  );

  return (
    <>
      <Menu trigger={trigger ?? defaultTrigger} open={menuOpen} onOpenChange={setMenuOpen}>
        {isOwner ? (
          <MenuItem icon={<ListPlus />} onSelect={() => setAddToCollectionOpen(true)}>
            Add to collection
          </MenuItem>
        ) : null}
        {collectionId && hasRole(print.access_role, "edit") ? (
          <MenuItem icon={<ListMinus />} onSelect={() => void handleRemoveFromCollection()}>
            Remove from collection
          </MenuItem>
        ) : null}
        <MenuItem icon={<Download />} disabled={download.downloading} onSelect={download.handleDownload}>
          Download
        </MenuItem>
        {hasRole(print.access_role, "edit") ? (
          <MenuItem asChild>
            <Link to={`/models/${print.id}?edit=${print.id}`}>
              <ItemBody icon={<Pencil />}>Edit</ItemBody>
            </Link>
          </MenuItem>
        ) : null}
        {isOwner ? (
          <MenuItem icon={<Share2 />} onSelect={() => setShareOpen(true)}>
            Share…
          </MenuItem>
        ) : null}
        {hasRole(print.access_role, "delete") ? (
          <MenuItem icon={<Trash2 />} danger onSelect={() => void handleDelete()}>
            Delete
          </MenuItem>
        ) : null}
        <MenuSeparator />
        {/* One target: a plain link to it. Several: a dialog picks which file. */}
        {slicerTargets.length === 1 ? (
          <MenuItem asChild>
            <a href={slicerTargets[0]?.href} onClick={download.recordUse}>
              <ItemBody icon={<Rocket />}>{slicerOption ? `Open in ${slicerOption.label}` : "Open in Slicer"}</ItemBody>
            </a>
          </MenuItem>
        ) : (
          <MenuItem
            icon={<Rocket />}
            disabled={slicerTargets.length === 0}
            onSelect={() => setSlicerPickerOpen(true)}
          >
            {slicerOption ? `Open in ${slicerOption.label}` : "Open in Slicer"}
          </MenuItem>
        )}
        {slicerOption && normalizedTargets.length > 0 ? (
          <MenuItem
            className="text-warning data-[highlighted]:bg-warning-soft"
            disabled={normalizedState === "preparing"}
            icon={
              normalizedState === "preparing" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <NormalizeInfoIcon slicerLabel={slicerOption.label} />
              )
            }
            onSelect={(event) => {
              if (!singleNormalized) {
                setNormalizedPickerOpen(true);
                return;
              }
              // Stays open while preparing, so the item can show progress and then "ready".
              event.preventDefault();
              void normalized.open(singleNormalized).then((launched) => launched && setMenuOpen(false));
            }}
          >
            {normalizedLabel(slicerOption.label)}
          </MenuItem>
        ) : null}
        {providerInfo && print.source_url ? (
          <MenuItem asChild>
            <a href={print.source_url} target="_blank" rel="noopener noreferrer">
              <ItemBody icon={<ExternalLink />}>{`Open in ${providerInfo.label}`}</ItemBody>
            </a>
          </MenuItem>
        ) : null}
      </Menu>

      {slicerOption && slicerTargets.length > 1 ? (
        <SlicerFileDialog
          open={slicerPickerOpen}
          onOpenChange={setSlicerPickerOpen}
          slicerLabel={slicerOption.label}
          targets={slicerTargets}
          onOpen={download.recordUse}
        />
      ) : null}
      {slicerOption && normalizedTargets.length > 1 ? (
        <SlicerFileDialog
          open={normalizedPickerOpen}
          onOpenChange={setNormalizedPickerOpen}
          slicerLabel={slicerOption.label}
          title={`Open normalized in ${slicerOption.label}`}
          targets={normalizedTargets}
          onOpen={download.recordUse}
          normalized={normalized}
        />
      ) : null}

      <DownloadPickerDialog
        open={download.pickerOpen}
        onOpenChange={download.setPickerOpen}
        downloading={download.downloading}
        sortedPlates={download.sortedPlates}
        downloadAllZip={download.downloadAllZip}
        downloadPlate={download.downloadPlate}
      />

      {isOwner ? <AddToCollectionDialog open={addToCollectionOpen} onOpenChange={setAddToCollectionOpen} printId={print.id} /> : null}

      {isOwner ? (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          name={title}
          loadShares={() => printsApi.listShares(print.id)}
          saveShares={(ids) => printsApi.setShares(print.id, ids)}
        />
      ) : null}
    </>
  );
}
