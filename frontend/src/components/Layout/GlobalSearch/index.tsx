import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import InputBase from "@mui/material/InputBase";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemText from "@mui/material/ListItemText";
import Avatar from "@mui/material/Avatar";
import Divider from "@mui/material/Divider";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import CollectionsIcon from "@mui/icons-material/Collections";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import { UnauthorizedError } from "../../../api/client";
import { type SearchResult, searchApi } from "../../../api/search";
import { printsApi } from "../../../api/prints";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";

const MIN_QUERY_LENGTH = 2;
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
const DEBOUNCE_MS = 250;

type Props = {
  onUnauthorized?: () => void;
};

/** Ranking happens server-side (searchService.ts). */
export default function GlobalSearch({ onUnauthorized }: Props) {
  const { t } = useTranslation(["app", "common"]);
  const navigate = useNavigate();
  const location = useLocation();
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The row Enter would open; moved with the arrow keys.
  const [activeIndex, setActiveIndex] = useState(0);
  // Tracked with ResizeObserver so the dropdown matches the fluid search box's width.
  const [anchorWidth, setAnchorWidth] = useState<number>();
  const debouncedQuery = useDebouncedValue(query.trim(), DEBOUNCE_MS);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const update = () => setAnchorWidth(el.offsetWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Ctrl/Cmd+K, or "/" outside a text field, jumps to the search box from anywhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { key, metaKey, ctrlKey, altKey, target } = event;
      const typing =
        target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      const combo = (metaKey || ctrlKey) && key.toLowerCase() === "k";
      if (combo || (key === "/" && !typing && !metaKey && !ctrlKey && !altKey)) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => setActiveIndex(0), [result]);

  // Clear the query on route change, but not on same-page changes like search params.
  useEffect(() => {
    setQuery("");
    setFocused(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (debouncedQuery.length < MIN_QUERY_LENGTH) {
      setResult(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await searchApi.search(debouncedQuery);
        if (!cancelled) setResult(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) {
          onUnauthorized?.();
          return;
        }
        console.error(err);
        setError(t("app:search.failed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  const closeDropdown = () => setFocused(false);

  const goTo = (path: string) => {
    closeDropdown();
    setQuery("");
    navigate(path);
  };

  const trimmedQuery = query.trim();
  const dropdownOpen = focused && trimmedQuery.length >= MIN_QUERY_LENGTH;
  const hasResults = Boolean(result && (result.models.length || result.collections.length || result.tags.length));

  // Every result in display order, so the arrow keys can walk across the three sections.
  const flatPaths: string[] = result
    ? [
        ...result.models.map((p) => `/models/${p.id}`),
        ...result.collections.map((c) => `/models/collections/${c.id}`),
        ...result.tags.map((tg) => `/models/tags/${encodeURIComponent(tg.tag)}`),
      ]
    : [];
  const collectionsStart = result?.models.length ?? 0;
  const tagsStart = collectionsStart + (result?.collections.length ?? 0);

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const { key } = event;
    if (key === "Escape") {
      event.currentTarget.blur();
      closeDropdown();
    } else if (key === "ArrowDown" && flatPaths.length) {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % flatPaths.length);
    } else if (key === "ArrowUp" && flatPaths.length) {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + flatPaths.length) % flatPaths.length);
    } else if (key === "Enter" && dropdownOpen && flatPaths[activeIndex]) {
      event.preventDefault();
      goTo(flatPaths[activeIndex]);
    }
  };

  return (
    <Box ref={anchorRef} sx={{ position: "relative", width: "100%" }}>
      <Paper
        variant="outlined"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          px: 1.5,
          height: 40,
          borderRadius: "12px",
          bgcolor: "background.paper",
          borderColor: focused ? "primary.main" : "divider",
          boxShadow: (theme) => (focused ? `0 0 0 3px ${theme.palette.action.focus}` : "none"),
          transition: "border-color .15s, box-shadow .15s",
        }}
      >
        <SearchIcon fontSize="small" sx={{ color: focused ? "primary.main" : "text.disabled" }} />
        <InputBase
          fullWidth
          size="small"
          inputRef={inputRef}
          placeholder={t("app:search.placeholder") ?? undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={onInputKeyDown}
          slotProps={{
            input: { "aria-label": t("app:search.placeholder") ?? undefined, role: "combobox", "aria-expanded": dropdownOpen },
          }}
          sx={{ fontSize: 14 }}
        />
        {query ? (
          <IconButton size="small" onClick={() => setQuery("")} aria-label={t("app:search.clear") ?? undefined}>
            <CloseIcon fontSize="inherit" />
          </IconButton>
        ) : (
          !focused && (
            <Box
              component="kbd"
              aria-hidden="true"
              sx={{
                flexShrink: 0,
                px: 0.75,
                py: 0.125,
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1.6,
                color: "text.secondary",
                backgroundColor: (theme) => theme.thingport.surfaceMuted,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: "6px",
              }}
            >
              {IS_MAC ? "⌘K" : "Ctrl K"}
            </Box>
          )
        )}
      </Paper>

      <Popover
        open={dropdownOpen}
        anchorEl={anchorRef.current}
        onClose={closeDropdown}
        disableAutoFocus
        disableEnforceFocus
        disableRestoreFocus
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { width: anchorWidth, mt: 0, maxHeight: 480, overflow: "auto" } } }}
      >
        {loading && (
          <Stack
            sx={{
              alignItems: "center",
              py: 3,
            }}
          >
            <CircularProgress size={20} />
          </Stack>
        )}
        {!loading && error && (
          <Typography variant="body2" color="error" sx={{ p: 2 }}>
            {error}
          </Typography>
        )}
        {!loading && !error && result && !hasResults && (
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              p: 2,
            }}
          >
            {t("app:search.noResults", { query: trimmedQuery })}
          </Typography>
        )}
        {!loading && !error && result && hasResults && (
          <Stack divider={<Divider />}>
            {result.models.length > 0 && (
              <Box sx={{ py: 0.5 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    display: "block",
                    px: 2,
                    pt: 1,
                    pb: 0.5,
                    color: "text.secondary",
                  }}
                >
                  {t("app:search.sectionModels")}
                </Typography>
                <List disablePadding>
                  {result.models.map((print) => (
                    <ListItemButton
                      key={print.id}
                      selected={activeIndex === result.models.indexOf(print)}
                      onMouseEnter={() => setActiveIndex(result.models.indexOf(print))}
                      onClick={() => goTo(`/models/${print.id}`)}
                    >
                      <ListItemAvatar sx={{ minWidth: 44 }}>
                        <Avatar
                          variant="rounded"
                          src={print.thumb_url ? printsApi.fileUrl(print.thumb_url) : undefined}
                          sx={{ width: 36, height: 36, bgcolor: "action.hover" }}
                        >
                          <ViewInArIcon fontSize="small" sx={{ color: "text.disabled" }} />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={print.title || print.name}
                        secondary={print.category_name || undefined}
                        slotProps={{
                          primary: { noWrap: true },
                          secondary: { noWrap: true },
                        }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Box>
            )}
            {result.collections.length > 0 && (
              <Box sx={{ py: 0.5 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    display: "block",
                    px: 2,
                    pt: 1,
                    pb: 0.5,
                    color: "text.secondary",
                  }}
                >
                  {t("app:search.sectionCollections")}
                </Typography>
                <List disablePadding>
                  {result.collections.map((collection) => (
                    <ListItemButton
                      key={collection.id}
                      selected={activeIndex === collectionsStart + result.collections.indexOf(collection)}
                      onMouseEnter={() => setActiveIndex(collectionsStart + result.collections.indexOf(collection))}
                      onClick={() => goTo(`/models/collections/${collection.id}`)}
                    >
                      <ListItemAvatar sx={{ minWidth: 44 }}>
                        <Avatar variant="rounded" sx={{ width: 36, height: 36, bgcolor: "action.hover" }}>
                          <CollectionsIcon fontSize="small" sx={{ color: "text.disabled" }} />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={collection.name}
                        secondary={t("app:search.modelCount", { count: collection.item_count })}
                        slotProps={{
                          primary: { noWrap: true },
                        }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Box>
            )}
            {result.tags.length > 0 && (
              <Box sx={{ py: 0.5 }}>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    display: "block",
                    px: 2,
                    pt: 1,
                    pb: 0.5,
                    color: "text.secondary",
                  }}
                >
                  {t("app:search.sectionTags")}
                </Typography>
                <List disablePadding>
                  {result.tags.map((tagResult) => (
                    <ListItemButton
                      key={tagResult.tag}
                      selected={activeIndex === tagsStart + result.tags.indexOf(tagResult)}
                      onMouseEnter={() => setActiveIndex(tagsStart + result.tags.indexOf(tagResult))}
                      onClick={() => goTo(`/models/tags/${encodeURIComponent(tagResult.tag)}`)}
                    >
                      <ListItemAvatar sx={{ minWidth: 44 }}>
                        <Avatar variant="rounded" sx={{ width: 36, height: 36, bgcolor: "action.hover" }}>
                          <LocalOfferIcon fontSize="small" sx={{ color: "text.disabled" }} />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={tagResult.tag}
                        secondary={t("app:search.modelCount", { count: tagResult.count })}
                        slotProps={{
                          primary: { noWrap: true },
                        }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Box>
            )}
          </Stack>
        )}
      </Popover>
    </Box>
  );
}
