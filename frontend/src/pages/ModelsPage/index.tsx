import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Skeleton from "@mui/material/Skeleton";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import { UnauthorizedError } from "../../api/client";
import { type Print, type PrintSortMode, printsApi } from "../../api/prints";
import { type Category, type CategoryMetaInput, categoriesApi } from "../../api/categories";
import { type PreviewMode } from "../../api/settings";
import type { AuthUser } from "../../api/auth";
import { type ResolvedTheme } from "../../constants/settingsOptions";
import { usePageHeader } from "../../components/Layout/PageHeaderContext";
import { buildCategoryTree, subtreeIds } from "../../utils/categoryTree";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import CategoriesPanel from "./CategoriesPanel";
import CategoryBanner from "./CategoryBanner";
import ModelCard from "./ModelCard";
import SortTabs from "./SortTabs";

const PAGE_SIZE = 24;

type Props = {
  categoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  categoriesVersion: number;
  onCategoriesChanged: () => void;
  /** Bumped when prints change elsewhere, to refetch the grid. */
  printsVersion: number;
  onUnauthorized?: () => void;
  theme: ResolvedTheme;
  previewMode: PreviewMode;
  viewer?: AuthUser | null;
};

const CARD_GRID_COLUMNS = "repeat(auto-fill, minmax(236px, 1fr))";

export default function ModelsPage({
  categoryId,
  onSelectCategory,
  categoriesVersion,
  onCategoriesChanged,
  printsVersion,
  onUnauthorized,
  theme,
  previewMode,
  viewer,
}: Props) {
  const { t } = useTranslation(["models", "common"]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [items, setItems] = useState<Print[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const sortModeParam = searchParams.get("orderBy");
  const sortMode: PrintSortMode =
    sortModeParam === "popular" || sortModeParam === "downloads" ? sortModeParam : "newest";
  const scopeParam = searchParams.get("scope");
  const scope: "mine" | "shared" | "all" = scopeParam === "shared" || scopeParam === "all" ? scopeParam : "mine";
  const setScope = (next: "mine" | "shared" | "all") => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === "mine") p.delete("scope");
      else p.set("scope", next);
      return p;
    });
  };

  const setSortMode = (mode: PrintSortMode) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (mode === "newest") next.delete("orderBy");
      else next.set("orderBy", mode);
      return next;
    });
  };

  // Mirrors the selected category into ?category=<id>. When the URL and state disagree, both sync
  // effects fire and undo each other, causing flicker; `syncingFromUrlRef` marks a change that came
  // from the URL so it isn't pushed straight back.
  const categoryParam = searchParams.get("category");
  const syncingFromUrlRef = useRef(false);

  useEffect(() => {
    if (categoryParam !== categoryId) {
      syncingFromUrlRef.current = true;
      onSelectCategory(categoryParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryParam]);

  useEffect(() => {
    if (syncingFromUrlRef.current) {
      syncingFromUrlRef.current = false;
      return;
    }
    if ((searchParams.get("category") || null) === categoryId) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (categoryId) next.set("category", categoryId);
      else next.delete("category");
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  // A category includes the models at every level beneath it.
  const categoryIdFilter = useMemo(() => {
    if (!categoryId) return undefined;
    const ids = subtreeIds(buildCategoryTree(categories), categoryId);
    return ids.length === 1 ? categoryId : ids;
  }, [categoryId, categories]);

  const selectedCategory = categoryId ? (categories.find((f) => f.id === categoryId) ?? null) : null;
  usePageHeader({
    title: selectedCategory ? selectedCategory.name || t("models:categories.untitled") : undefined,
    subtitle: selectedCategory ? t("models:categories.subtitle") : undefined,
    onBack: categoryId ? () => onSelectCategory(null) : undefined,
  });

  // Which empty state fits: a brand-new library, nothing shared yet, or a filter with no hits.
  const emptyKey = (part: "Title" | "Hint") =>
    `models:grid.${categoryId ? "emptyFiltered" : scope === "mine" ? "empty" : "emptyShared"}${part}` as const;

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
    setCategoriesLoading(true);
    (async () => {
      try {
        setCategories(await categoriesApi.list());
      } catch (err) {
        handleError(err, t("models:errors.loadCategoriesFailed"));
      } finally {
        setCategoriesLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriesVersion]);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const result = await printsApi.list({
          category_id: categoryIdFilter,
          order_by: sortMode,
          scope,
          limit: PAGE_SIZE,
          offset: 0,
        });
        setItems(result.items);
        setOffset(result.items.length);
        setHasMore(result.hasMore);
      } catch (err) {
        handleError(err, t("models:errors.loadFailed"));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryIdFilter, printsVersion, sortMode, scope]);

  // Live-refresh cards whose files are still being processed (thumbnail/preview/geometry), so a
  // freshly dropped model flips from a placeholder to its preview without a manual reload.
  useEffect(() => {
    const processingIds = items
      .filter((it) => it.plates?.some((p) => p.processing_status === "queued" || p.processing_status === "processing"))
      .map((it) => it.id);
    if (!processingIds.length) return;
    const timer = setTimeout(async () => {
      const updated = await Promise.all(processingIds.map((id) => printsApi.get(id).catch(() => null)));
      const byId = new Map(updated.filter((u): u is Print => Boolean(u)).map((u) => [u.id, u]));
      if (byId.size) setItems((prev) => prev.map((it) => byId.get(it.id) ?? it));
    }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const result = await printsApi.list({
        category_id: categoryIdFilter,
        order_by: sortMode,
        scope,
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

  const loadMoreSentinelRef = useInfiniteScroll(loadMore, hasMore, loading || loadingMore);

  const createCategory = async (name: string, parentId: string | null) => {
    try {
      await categoriesApi.create(name, [], parentId || undefined);
      onCategoriesChanged();
    } catch (err) {
      handleError(err, t("models:errors.createCategoryFailed"));
    }
  };

  const renameCategory = async (id: string, name: string) => {
    const existing = categories.find((f) => f.id === id);
    try {
      await categoriesApi.update(id, name, existing?.tags || [], existing?.parent_id || undefined);
      onCategoriesChanged();
    } catch (err) {
      handleError(err, t("models:errors.renameCategoryFailed"));
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      await categoriesApi.delete(id);
      onCategoriesChanged();
      if (categoryId === id) onSelectCategory(null);
    } catch (err) {
      handleError(err, t("models:errors.deleteCategoryFailed"));
    }
  };

  // Refetch even on failure: the manager shows the drop optimistically until fresh categories arrive.
  const reorderCategories = async (categoryIds: string[]) => {
    try {
      await categoriesApi.reorder(categoryIds);
    } catch (err) {
      handleError(err, t("models:errors.reorderCategoryFailed"));
    } finally {
      onCategoriesChanged();
    }
  };

  const moveCategory = async (id: string, parentId: string | null, position: number) => {
    try {
      await categoriesApi.move(id, parentId, position);
    } catch (err) {
      handleError(err, t("models:errors.moveCategoryFailed"));
    } finally {
      onCategoriesChanged();
    }
  };

  const updateCategoryMeta = async (id: string, meta: CategoryMetaInput) => {
    try {
      await categoriesApi.updateMeta(id, meta);
      onCategoriesChanged();
    } catch (err) {
      // Rethrow so CategoryMetaDialog shows the error inline and keeps the user's edits.
      if (handleError(err)) return;
      throw err;
    }
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: "1920px", mx: "auto" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={scope}
          aria-label={t("scope.label", { defaultValue: "Show" })}
          onChange={(_, next: typeof scope | null) => next && setScope(next)}
        >
          {(["mine", "shared", "all"] as const).map((s) => (
            <ToggleButton key={s} value={s}>
              {t(`scope.${s}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <SortTabs value={sortMode} onChange={setSortMode} />
      </Box>
      <Stack
        direction="row"
        spacing={2}
        sx={{
          alignItems: "flex-start",
        }}
      >
        <CategoriesPanel
          categories={categories}
          loading={categoriesLoading}
          selectedId={categoryId}
          onSelect={onSelectCategory}
          onCreate={createCategory}
          onRename={renameCategory}
          onDelete={deleteCategory}
          onReorder={reorderCategories}
          onMove={moveCategory}
          onUpdateMeta={updateCategoryMeta}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {selectedCategory?.meta_title && (
            <Box sx={{ mb: 2 }}>
              <CategoryBanner category={selectedCategory} />
            </Box>
          )}
          {loading ? (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: CARD_GRID_COLUMNS,
                gap: "20px",
              }}
            >
              {Array.from({ length: 10 }).map((_, i) => (
                <Box key={i}>
                  <Box sx={{ width: "100%", aspectRatio: "4 / 3" }}>
                    <Skeleton variant="rounded" width="100%" height="100%" sx={{ borderRadius: "14px" }} />
                  </Box>
                  <Skeleton variant="text" sx={{ mt: 1, width: "70%" }} />
                  <Skeleton variant="text" sx={{ width: "40%" }} />
                </Box>
              ))}
            </Box>
          ) : items.length ? (
            <Stack spacing={2}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: CARD_GRID_COLUMNS,
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
                      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
                    }
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
                py: 10,
                px: 2,
                color: "text.secondary",
                textAlign: "center",
              }}
            >
              <ViewInArIcon sx={{ fontSize: 56, opacity: 0.35, mb: 1 }} />
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 600,
                  color: (muiTheme) => muiTheme.thingport.headingText,
                }}
              >
                {t(emptyKey("Title"))}
              </Typography>
              <Typography variant="body2" sx={{ maxWidth: 420 }}>
                {t(emptyKey("Hint"))}
              </Typography>
            </Stack>
          )}
        </Box>
      </Stack>
    </Stack>
  );
}
