import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import { UnauthorizedError } from "../../api/client";
import { type Collection, collectionsApi } from "../../api/collections";
import { type Print, type PrintSortMode, printsApi } from "../../api/prints";
import { type PreviewMode } from "../../api/settings";
import type { AuthUser } from "../../api/auth";
import { type ResolvedTheme } from "../../constants/settingsOptions";
import { usePageHeader } from "../../components/Layout/PageHeaderContext";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { hasRole } from "../../utils/access";
import { collectionDisplayName } from "../../utils/collectionDisplay";
import ModelCard from "../ModelsPage/ModelCard";
import SortTabs from "../ModelsPage/SortTabs";
import CollectionActionsMenu from "./CollectionActionsMenu";
import CollectionBookmarkButton from "./CollectionBookmarkButton";

const PAGE_SIZE = 24;

type Props = {
  theme: ResolvedTheme;
  previewMode: PreviewMode;
  onUnauthorized?: () => void;
  onBookmarksChanged?: () => void;
  viewer?: AuthUser | null;
};

export default function CollectionDetailPage({
  theme,
  previewMode,
  onUnauthorized,
  onBookmarksChanged,
  viewer,
}: Props) {
  const { collectionId } = useParams<{ collectionId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation(["models", "common"]);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [items, setItems] = useState<Print[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const sortModeParam = searchParams.get("orderBy");
  const sortMode: PrintSortMode =
    sortModeParam === "popular" || sortModeParam === "downloads" ? sortModeParam : "newest";

  const setSortMode = (mode: PrintSortMode) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (mode === "newest") next.delete("orderBy");
      else next.set("orderBy", mode);
      return next;
    });
  };

  const goBack = () => navigate("/models/collections");

  usePageHeader({
    title: collection
      ? t("models:collections.detail.title", { name: collectionDisplayName(collection, t) })
      : undefined,
    subtitle: collection ? t("models:collections.detail.subtitle") : undefined,
    actions:
      collection && !collection.system_key ? (
        <Stack
          direction="row"
          spacing={0.5}
          sx={{
            alignItems: "center",
          }}
        >
          <CollectionBookmarkButton
            collectionId={collection.id}
            bookmarked={collection.bookmarked}
            onUnauthorized={onUnauthorized}
            onBookmarksChanged={onBookmarksChanged}
            onToggled={(bookmarked) => setCollection((prev) => (prev ? { ...prev, bookmarked } : prev))}
          />
          <CollectionActionsMenu
            collection={collection}
            onUpdated={setCollection}
            onUnauthorized={onUnauthorized}
            onDeleted={goBack}
            onBookmarksChanged={onBookmarksChanged}
          />
        </Stack>
      ) : undefined,
  });

  const handleError = (err: unknown, message?: string) => {
    if (err instanceof UnauthorizedError) {
      onUnauthorized?.();
      return true;
    }
    console.error(err);
    if (message) alert(message);
    return false;
  };

  useEffect(() => {
    if (!collectionId) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const [collectionResult, printsResult] = await Promise.all([
          collectionsApi.get(collectionId),
          printsApi.list({ collection_id: collectionId, order_by: sortMode, limit: PAGE_SIZE, offset: 0 }),
        ]);
        if (cancelled) return;
        setCollection(collectionResult);
        setItems(printsResult.items);
        setOffset(printsResult.items.length);
        setHasMore(printsResult.hasMore);
      } catch (err) {
        if (cancelled) return;
        if (handleError(err)) return;
        setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId, sortMode, reloadKey]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || !collectionId) return;
    setLoadingMore(true);
    try {
      const result = await printsApi.list({
        collection_id: collectionId,
        order_by: sortMode,
        limit: PAGE_SIZE,
        offset,
      });
      setItems((prev) => [...prev, ...result.items]);
      setOffset(offset + result.items.length);
      setHasMore(result.hasMore);
    } catch (err) {
      handleError(err, t("models:errors.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  };

  // Sequential, one model per file; the server files each into this collection (needs the upload role or better).
  const uploadFiles = async (files: File[]) => {
    if (!collectionId || !files.length) return;
    setUploading(true);
    const failed: string[] = [];
    for (const file of files) {
      try {
        await printsApi.upload([file], { collection_id: collectionId });
      } catch (err) {
        if (handleError(err)) return;
        failed.push(file.name);
      }
    }
    setUploading(false);
    setReloadKey((k) => k + 1);
    if (failed.length) alert(t("models:collections.detail.uploadFailed", { names: failed.join(", ") }));
  };

  const loadMoreSentinelRef = useInfiniteScroll(loadMore, hasMore, loading || loadingMore);

  if (loading) {
    return (
      <Stack
        sx={{
          alignItems: "center",
          py: 8,
        }}
      >
        <CircularProgress size={22} />
      </Stack>
    );
  }

  if (notFound || !collection) {
    return (
      <Stack
        spacing={1}
        sx={{
          alignItems: "center",
          py: 8,
          color: "text.secondary",
        }}
      >
        <Typography variant="body2">{t("models:collections.errors.notFound")}</Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: "1920px", mx: "auto" }}>
      {collection.description && (
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
          {collection.description}
        </Typography>
      )}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {!collection.system_key && hasRole(collection.my_role, "upload") && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                data-testid="collection-upload-input"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  void uploadFiles(files);
                }}
              />
              <Button
                variant="contained"
                size="small"
                disabled={uploading}
                startIcon={uploading ? <CircularProgress size={14} color="inherit" /> : <FileUploadOutlinedIcon />}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? t("models:collections.detail.uploading") : t("models:collections.detail.upload")}
              </Button>
            </>
          )}
          {collection.is_owner === false && collection.owner && (
            <Chip
              size="small"
              variant="outlined"
              label={`${t("models:collections.detail.sharedBy", { name: collection.owner.display_name })} · ${t(`models:share.roles.${collection.my_role ?? "view"}`)}`}
            />
          )}
        </Stack>
        <SortTabs value={sortMode} onChange={setSortMode} />
      </Box>
      {items.length ? (
        <Stack spacing={2}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(236px, 1fr))",
              gap: "20px",
            }}
          >
            {items.map((item) => (
              <ModelCard
                key={item.id}
                item={item}
                theme={theme}
                previewMode={previewMode}
                onDeleted={(deletedId) => setItems((prev) => prev.filter((i) => i.id !== deletedId))}
                onFavoriteChange={(updated) =>
                  setItems((prev) =>
                    // Unfavoriting inside Favourites drops the item immediately.
                    collection?.system_key === "favorites" && !updated.is_favorite
                      ? prev.filter((i) => i.id !== updated.id)
                      : prev.map((i) => (i.id === updated.id ? updated : i)),
                  )
                }
                collectionId={collection && !collection.system_key ? collection.id : undefined}
                onRemovedFromCollection={(removedId) => setItems((prev) => prev.filter((i) => i.id !== removedId))}
                onUpdated={(updated) => setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))}
                onUnauthorized={onUnauthorized}
                viewer={viewer}
              />
            ))}
          </Box>
          {hasMore && (
            <Stack
              ref={loadMoreSentinelRef}
              direction="row"
              sx={{
                justifyContent: "center",
                py: 1,
              }}
            >
              {loadingMore && (
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{
                    alignItems: "center",
                    color: "text.secondary",
                  }}
                >
                  <CircularProgress size={14} />
                  <Typography variant="caption">{t("models:grid.loadingMore")}</Typography>
                </Stack>
              )}
            </Stack>
          )}
        </Stack>
      ) : (
        <Stack
          spacing={1}
          sx={{
            alignItems: "center",
            py: 8,
            color: "text.secondary",
          }}
        >
          <Typography variant="body2">{t("models:collections.detail.empty")}</Typography>
        </Stack>
      )}
    </Stack>
  );
}
