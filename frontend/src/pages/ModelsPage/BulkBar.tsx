import { useState } from "react";
import { useTranslation } from "react-i18next";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import CloseIcon from "@mui/icons-material/Close";
import PlaylistAddIcon from "@mui/icons-material/PlaylistAdd";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { UnauthorizedError } from "../../api/client";
import { type Print, printsApi } from "../../api/prints";
import { type Category } from "../../api/categories";
import { type Collection, collectionsApi } from "../../api/collections";
import { useConfirm } from "../../components/ConfirmProvider";
import { useToast } from "../../components/ToastProvider";
import TagInput from "../../components/TagInput";

type Props = {
  selected: Print[];
  categories: Category[];
  onClear: () => void;
  /** Some models changed on the server; the page should reload its list. */
  onChanged: () => void;
  onUnauthorized?: () => void;
};

/** "Parent / Child" labels so nested categories stay distinguishable in a flat menu. */
export function categoryPaths(categories: Category[]): { id: string; label: string }[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const label = (c: Category): string => {
    const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
    return parent ? `${label(parent)} / ${c.name}` : c.name;
  };
  return categories.map((c) => ({ id: c.id, label: label(c) })).toSorted((a, b) => a.label.localeCompare(b.label));
}

export default function BulkBar({ selected, categories, onClear, onChanged, onUnauthorized }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const confirm = useConfirm();
  const toast = useToast();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [collectionAnchor, setCollectionAnchor] = useState<HTMLElement | null>(null);
  const [categoryAnchor, setCategoryAnchor] = useState<HTMLElement | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [newTags, setNewTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  /** Runs one request per model; reports failures once and refreshes the list. */
  const runAll = async (work: (print: Print) => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      const results = await Promise.allSettled(selected.map(work));
      if (results.some((r) => r.status === "rejected" && r.reason instanceof UnauthorizedError)) {
        onUnauthorized?.();
        return;
      }
      const failed = results.filter((r) => r.status === "rejected").length;
      toast(
        failed
          ? { message: t("models:bulk.partial", { failed, total: selected.length }), severity: "warning" }
          : { message: done, severity: "success" },
      );
      if (failed < selected.length) onClear();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const openCollections = async (anchor: HTMLElement) => {
    setCollectionAnchor(anchor);
    if (collections) return;
    try {
      setCollections(await collectionsApi.list());
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized?.();
      setCollections([]);
    }
  };

  const addToCollection = (collection: Collection) => {
    setCollectionAnchor(null);
    void runAll(
      (print) => collectionsApi.addItem(collection.id, print.id),
      t("models:bulk.doneCollection", { name: collection.name }),
    );
  };

  const applyTags = () => {
    const tags = newTags;
    setTagsOpen(false);
    setNewTags([]);
    if (!tags.length) return;
    void runAll((print) => {
      const merged = [...print.tags];
      for (const tag of tags) {
        if (!merged.some((existing) => existing.toLowerCase() === tag.toLowerCase())) merged.push(tag);
      }
      return printsApi.setTags(print.id, merged);
    }, t("models:bulk.doneTags"));
  };

  const moveTo = (categoryId: string | null) => {
    setCategoryAnchor(null);
    void runAll((print) => printsApi.updateCategory(print.id, categoryId), t("models:bulk.doneMove"));
  };

  const remove = async () => {
    const ok = await confirm({
      message: t("models:bulk.confirmDelete", { count: selected.length }),
      destructive: true,
    });
    if (!ok) return;
    await runAll((print) => printsApi.delete(print.id), t("models:bulk.doneDelete", { count: selected.length }));
  };

  return (
    <>
      <Paper
        role="toolbar"
        aria-label={t("models:bulk.selected", { count: selected.length })}
        sx={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: (theme) => theme.zIndex.appBar + 1,
          px: 2,
          py: 1,
          borderRadius: "16px",
          border: 1,
          borderColor: (theme) => theme.thingport.borderStrong,
          boxShadow: (theme) => theme.thingport.shadowOverlay,
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
          <IconButton size="small" onClick={onClear} aria-label={t("models:bulk.clear")}>
            <CloseIcon fontSize="small" />
          </IconButton>
          <Typography variant="body2" sx={{ fontWeight: 600, pr: 1 }}>
            {t("models:bulk.selected", { count: selected.length })}
          </Typography>
          <Button
            size="small"
            disabled={busy}
            startIcon={<PlaylistAddIcon />}
            onClick={(e) => void openCollections(e.currentTarget)}
          >
            {t("models:bulk.addToCollection")}
          </Button>
          <Button size="small" disabled={busy} startIcon={<LocalOfferOutlinedIcon />} onClick={() => setTagsOpen(true)}>
            {t("models:bulk.addTags")}
          </Button>
          <Button
            size="small"
            disabled={busy}
            startIcon={<DriveFileMoveOutlinedIcon />}
            onClick={(e) => setCategoryAnchor(e.currentTarget)}
          >
            {t("models:bulk.moveToCategory")}
          </Button>
          <Button size="small" color="error" disabled={busy} startIcon={<DeleteOutlineIcon />} onClick={remove}>
            {t("models:bulk.delete")}
          </Button>
        </Stack>
      </Paper>

      <Menu anchorEl={collectionAnchor} open={Boolean(collectionAnchor)} onClose={() => setCollectionAnchor(null)}>
        {collections?.length === 0 && <MenuItem disabled>{t("models:bulk.noCollections")}</MenuItem>}
        {collections?.map((collection) => (
          <MenuItem key={collection.id} onClick={() => addToCollection(collection)}>
            {collection.name}
          </MenuItem>
        ))}
      </Menu>

      <Menu
        anchorEl={categoryAnchor}
        open={Boolean(categoryAnchor)}
        onClose={() => setCategoryAnchor(null)}
        slotProps={{ paper: { sx: { maxHeight: 360 } } }}
      >
        <MenuItem onClick={() => moveTo(null)}>{t("models:bulk.noCategory")}</MenuItem>
        {categoryPaths(categories).map((c) => (
          <MenuItem key={c.id} onClick={() => moveTo(c.id)}>
            {c.label}
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={tagsOpen} onClose={() => setTagsOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("models:bulk.addTagsTitle", { count: selected.length })}</DialogTitle>
        <DialogContent>
          <TagInput value={newTags} onChange={setNewTags} placeholder={t("models:bulk.tagsPlaceholder")} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTagsOpen(false)}>{t("common:cancel")}</Button>
          <Button variant="contained" onClick={applyTags} disabled={!newTags.length}>
            {t("models:bulk.addTagsApply")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
