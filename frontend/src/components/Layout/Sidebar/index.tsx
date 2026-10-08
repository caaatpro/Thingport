import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import type { SxProps, Theme } from "@mui/material/styles";
import { alpha, useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Tooltip from "@mui/material/Tooltip";
import Paper from "@mui/material/Paper";
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import CollectionsOutlinedIcon from "@mui/icons-material/CollectionsOutlined";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import KeyboardDoubleArrowLeftIcon from "@mui/icons-material/KeyboardDoubleArrowLeft";
import KeyboardDoubleArrowRightIcon from "@mui/icons-material/KeyboardDoubleArrowRight";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Wordmark from "../../Wordmark";
import BrandMark from "../../BrandMark";
import { type BookmarkEntry, bookmarksApi } from "../../../api/bookmarks";

const SIDEBAR_WIDTH = 248;
const SIDEBAR_COLLAPSED_WIDTH = 72;
const SIDEBAR_COLLAPSED_STORAGE_KEY = "thingport_sidebar_collapsed";

/** One row of the navigation. The selected row gets a tint, a bar on its left edge and bolder text. */
function navRowSx(selected: boolean, collapsed = false): SxProps<Theme> {
  return {
    position: "relative",
    minHeight: 40,
    mb: 0.25,
    px: collapsed ? 0 : 1.25,
    justifyContent: collapsed ? "center" : "flex-start",
    borderRadius: "10px",
    color: (theme: Theme) => (selected ? theme.thingport.selectedNavText : theme.thingport.navInactiveText),
    fontWeight: selected ? 650 : 500,
    "& .MuiListItemIcon-root": { minWidth: collapsed ? 0 : 34, color: "inherit" },
    "& .MuiListItemText-primary": { fontWeight: "inherit", fontSize: "0.875rem" },
    "&:hover": {
      backgroundColor: (theme: Theme) =>
        selected ? theme.thingport.selectedNavBackground : theme.palette.action.hover,
      color: (theme: Theme) => (selected ? theme.thingport.selectedNavText : theme.palette.text.primary),
    },
    ...(selected && {
      backgroundColor: (theme: Theme) => theme.thingport.selectedNavBackground,
      "&.Mui-selected, &.Mui-selected:hover": {
        backgroundColor: (theme: Theme) => theme.thingport.selectedNavBackground,
      },
      "&::before": {
        content: '""',
        position: "absolute",
        left: collapsed ? 4 : -8,
        top: 9,
        bottom: 9,
        width: 3,
        borderRadius: 3,
        backgroundColor: (theme: Theme) => theme.thingport.selectedNavText,
      },
    }),
  };
}

function NavItem({
  icon,
  label,
  selected,
  collapsed,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const row = (
    <ListItemButton
      selected={selected}
      onClick={onClick}
      aria-current={selected ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      sx={navRowSx(selected, collapsed)}
    >
      <ListItemIcon>{icon}</ListItemIcon>
      {!collapsed && <ListItemText primary={label} slotProps={{ primary: { noWrap: true } }} />}
    </ListItemButton>
  );
  return collapsed ? (
    <Tooltip title={label} placement="right">
      {row}
    </Tooltip>
  ) : (
    row
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      sx={{
        display: "block",
        px: 1.5,
        pt: 2,
        pb: 0.75,
        fontWeight: 650,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontSize: "0.6875rem",
        color: (theme) => theme.palette.text.disabled,
      }}
    >
      {children}
    </Typography>
  );
}

type Props = {
  isAdmin: boolean;
  onSelectCategory: (id: string | null) => void;
  /** Bumped when a bookmark changes elsewhere, to refetch the list. */
  bookmarksVersion?: number;
};

function bookmarkTarget(entry: BookmarkEntry): { href: string; label: string } {
  return entry.type === "tag"
    ? { href: `/models/tags/${encodeURIComponent(entry.tag)}`, label: entry.tag }
    : { href: `/models/collections/${entry.collection_id}`, label: entry.name };
}

// A click that ends a drag (pointer or Space key) must not also navigate.
const POST_DRAG_CLICK_GUARD_MS = 250;

/** The whole row drags; a few pixels of travel tell a drag from a click. */
function SortableBookmarkRow({
  id,
  label,
  selected,
  onNavigate,
}: {
  id: string;
  label: string;
  selected: boolean;
  onNavigate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <ListItemButton
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      selected={selected}
      onClick={onNavigate}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      sx={{
        ...navRowSx(selected),
        cursor: "grab",
        touchAction: "none",
        // The DragOverlay shows the dragged row; this one stays as a faint placeholder.
        opacity: isDragging ? 0.4 : 1,
        "& .drag-handle": { opacity: 0, transition: "opacity .15s" },
        "&:hover .drag-handle": { opacity: 1 },
      }}
    >
      <ListItemIcon>
        <BookmarkBorderIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText primary={label} slotProps={{ primary: { noWrap: true } }} />
      <DragIndicatorIcon className="drag-handle" fontSize="small" sx={{ ml: "auto", flexShrink: 0, color: "text.disabled" }} />
    </ListItemButton>
  );
}

export default function Sidebar({ isAdmin, onSelectCategory, bookmarksVersion }: Props) {
  const { t } = useTranslation(["app", "common"]);
  const muiTheme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  });
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const suppressClickRef = useRef(false);
  const endDrag = () => {
    setDraggingId(null);
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, POST_DRAG_CLICK_GUARD_MS);
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Space only: Enter keeps opening the bookmark.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  useEffect(() => {
    let cancelled = false;
    bookmarksApi
      .list()
      .then((entries) => {
        if (!cancelled) setBookmarks(entries);
      })
      .catch(() => {
        /* non-critical nav aid -- swallow and leave the list as-is */
      });
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [bookmarksVersion]);

  // Optimistic reorder; a failed save refetches the server's order.
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    endDrag();
    if (!over || active.id === over.id) return;
    const from = bookmarks.findIndex((b) => b.id === active.id);
    const to = bookmarks.findIndex((b) => b.id === over.id);
    if (from === -1 || to === -1) return;
    const next = arrayMove(bookmarks, from, to);
    setBookmarks(next);
    bookmarksApi.reorder(next.map((b) => b.id)).catch(() => {
      bookmarksApi
        .list()
        .then(setBookmarks)
        .catch(() => {
          /* leave the optimistic order as-is */
        });
    });
  };

  const navigateUnlessDragged = (href: string) => {
    if (draggingId || suppressClickRef.current) return;
    navigate(href);
  };

  const draggingBookmark = draggingId ? bookmarks.find((b) => b.id === draggingId) : undefined;

  const onDashboard = location.pathname === "/";
  const onCollections = location.pathname.startsWith("/models/collections");
  const onTags = location.pathname.startsWith("/models/tags");
  const onModels =
    (location.pathname.startsWith("/models") && !onCollections && !onTags) || location.pathname.startsWith("/authors");
  const onDownload = location.pathname.startsWith("/downloads");
  const onAdmin = location.pathname.startsWith("/admin");

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const currentWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  // Always lands on the unfiltered grid, unlike the in-page back button.
  const goToModelsRoot = () => {
    onSelectCategory(null);
    navigate("/models");
  };

  return (
    <Box
      component="aside"
      sx={{
        width: currentWidth,
        flexShrink: 0,
        height: "100vh",
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        overflow: "hidden",
        transition: (theme) => theme.transitions.create("width", { duration: theme.transitions.duration.shorter }),
      }}
    >
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          px: collapsed ? 1 : 2,
          height: 64,
          flexShrink: 0,
        }}
      >
        <Link
          component={RouterLink}
          to="/"
          aria-label={t("sidebar.dashboard")}
          sx={{ display: collapsed ? "none" : "flex", alignItems: "center", lineHeight: 0 }}
        >
          <Wordmark size="lg" />
        </Link>
        {collapsed && (
          <Tooltip title={t("sidebar.expandSidebar")} placement="right">
            <IconButton onClick={toggleCollapsed} aria-label={t("sidebar.expandSidebar") ?? undefined} sx={{ p: 0.75 }}>
              <BrandMark theme={muiTheme.palette.mode} size="md" />
            </IconButton>
          </Tooltip>
        )}
        {!collapsed && (
          <Tooltip title={t("sidebar.collapseSidebar")}>
            <IconButton
              size="small"
              onClick={toggleCollapsed}
              aria-label={t("sidebar.collapseSidebar") ?? undefined}
              sx={{ color: "text.secondary" }}
            >
              <KeyboardDoubleArrowLeftIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      <Box component="nav" sx={{ flex: 1, overflow: "auto", px: collapsed ? 1 : 1.5, pb: 1 }}>
        <List disablePadding>
          {!collapsed && <GroupLabel>{t("sidebar.library")}</GroupLabel>}
          <NavItem
            icon={<SpaceDashboardOutlinedIcon fontSize="small" />}
            label={t("sidebar.dashboard")}
            selected={onDashboard}
            collapsed={collapsed}
            onClick={() => navigate("/")}
          />
          <NavItem
            icon={<ViewInArOutlinedIcon fontSize="small" />}
            label={t("sidebar.models")}
            selected={onModels}
            collapsed={collapsed}
            onClick={goToModelsRoot}
          />
          <NavItem
            icon={<CollectionsOutlinedIcon fontSize="small" />}
            label={t("sidebar.collections")}
            selected={onCollections}
            collapsed={collapsed}
            onClick={() => navigate("/models/collections")}
          />
          <NavItem
            icon={<LocalOfferOutlinedIcon fontSize="small" />}
            label={t("sidebar.tags")}
            selected={onTags && location.pathname === "/models/tags"}
            collapsed={collapsed}
            onClick={() => navigate("/models/tags")}
          />

          {/* Bookmarked tags and collections in the user's own order. Dragging only works while the
              sidebar is expanded: the collapsed rail is icon-only, with no room for a drop target. */}
          {bookmarks.length > 0 && (
            <>
              {collapsed ? (
                <Box sx={{ my: 1, mx: 1.5, borderTop: "1px solid", borderColor: "divider" }} />
              ) : (
                <GroupLabel>{t("sidebar.bookmarks")}</GroupLabel>
              )}
              {collapsed ? (
                bookmarks.map((entry) => {
                  const { href, label } = bookmarkTarget(entry);
                  return (
                    <NavItem
                      key={entry.id}
                      icon={<BookmarkBorderIcon fontSize="small" />}
                      label={label}
                      selected={location.pathname === href}
                      collapsed
                      onClick={() => navigate(href)}
                    />
                  );
                })
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={({ active }) => setDraggingId(String(active.id))}
                  onDragEnd={handleDragEnd}
                  onDragCancel={endDrag}
                >
                  <SortableContext items={bookmarks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                    {bookmarks.map((entry) => {
                      const { href, label } = bookmarkTarget(entry);
                      return (
                        <SortableBookmarkRow
                          key={entry.id}
                          id={entry.id}
                          label={label}
                          selected={location.pathname === href}
                          onNavigate={() => navigateUnlessDragged(href)}
                        />
                      );
                    })}
                  </SortableContext>
                  <DragOverlay>
                    {draggingBookmark && (
                      <Paper
                        elevation={8}
                        sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 0.75, cursor: "grabbing" }}
                      >
                        <BookmarkBorderIcon fontSize="small" />
                        <Typography variant="body2" noWrap>
                          {bookmarkTarget(draggingBookmark).label}
                        </Typography>
                      </Paper>
                    )}
                  </DragOverlay>
                </DndContext>
              )}
            </>
          )}
        </List>
      </Box>

      <Box
        sx={{
          px: collapsed ? 1 : 1.5,
          py: 1.25,
          borderTop: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
          backgroundColor: (theme) => alpha(theme.palette.text.primary, 0.015),
        }}
      >
        <NavItem
          icon={<DownloadOutlinedIcon fontSize="small" />}
          label={t("sidebar.downloads")}
          selected={onDownload}
          collapsed={collapsed}
          onClick={() => navigate("/downloads")}
        />
        {isAdmin && (
          <NavItem
            icon={<AdminPanelSettingsOutlinedIcon fontSize="small" />}
            label={t("sidebar.administration")}
            selected={onAdmin}
            collapsed={collapsed}
            onClick={() => navigate("/admin")}
          />
        )}
        {collapsed && (
          <Tooltip title={t("sidebar.expandSidebar")} placement="right">
            <IconButton
              onClick={toggleCollapsed}
              aria-label={t("sidebar.expandSidebar") ?? undefined}
              sx={{ width: "100%", color: "text.secondary", mt: 0.5 }}
            >
              <KeyboardDoubleArrowRightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}
