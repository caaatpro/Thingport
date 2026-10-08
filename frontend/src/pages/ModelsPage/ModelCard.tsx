import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import { useTheme } from "@mui/material/styles";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PrintIcon from "@mui/icons-material/Print";
import { type Print, printsApi } from "../../api/prints";
import { type PreviewMode } from "../../api/settings";
import { type ResolvedTheme } from "../../constants/settingsOptions";
import { renderPreviewContent } from "../../components/media/renderPreviewContent";
import { printProviderInfo } from "../../constants/importProviders";
import { SELF_AUTHOR_ID } from "../../constants/selfAuthor";
import { useGravatarUrl } from "../../hooks/useGravatarUrl";
import CardLink, { aboveCardLink } from "../../components/CardLink";
import StarToggle from "../../components/StarToggle";
import HoverSlideshow from "../../components/media/HoverSlideshow";
import AuthorHoverCard from "../../components/AuthorHoverCard";
import RollingNumber from "../../components/RollingNumber";
import { useFavoriteToggle } from "../../hooks/useFavoriteToggle";
import ModelActionsMenu from "../ModelDetailPage/ModelActionsMenu";
import VisibilityBadge from "../../components/VisibilityBadge";
import { formatFileSize } from "../../utils/fileSize";
import type { AuthUser } from "../../api/auth";

type Props = {
  item: Print;
  theme: ResolvedTheme;
  previewMode: PreviewMode;
  onDeleted?: (id: string) => void;
  onFavoriteChange?: (print: Print) => void;
  onUpdated?: (print: Print) => void;
  onUnauthorized?: () => void;
  /** Only for a real collection; shows "Remove from collection". */
  collectionId?: string;
  onRemovedFromCollection?: (id: string) => void;
  /** Shown as the author of a direct upload, which has none. */
  viewer?: AuthUser | null;
  /** Selection mode: set by the page when bulk actions apply to this card. */
  selected?: boolean;
  selectionActive?: boolean;
  onToggleSelect?: () => void;
};

const OVERLAY_BUTTON_SIZE = 34;
const HOVER_ICON_SIZE = 18;
const overlayButtonSx = {
  width: OVERLAY_BUTTON_SIZE,
  height: OVERLAY_BUTTON_SIZE,
  padding: 0,
  borderRadius: "50%",
  bgcolor: "background.paper",
  // Keep the background flat in every interaction state.
  "&:hover, &.Mui-focusVisible, &:active": { bgcolor: "background.paper" },
} as const;

export default function ModelCard({
  item,
  theme,
  previewMode,
  onDeleted,
  onFavoriteChange,
  onUpdated,
  onUnauthorized,
  collectionId,
  onRemovedFromCollection,
  viewer,
  selected = false,
  selectionActive = false,
  onToggleSelect,
}: Props) {
  const { t } = useTranslation(["models", "common"]);
  const muiTheme = useTheme();
  const overlayIconColor = muiTheme.thingport.headingText;
  const {
    isFavorite,
    toggle: toggleFavorite,
    label: favoriteLabel,
  } = useFavoriteToggle(item, {
    onUpdated: onFavoriteChange,
    onUnauthorized,
  });
  const author = item.author;
  const viewerAvatarUrl = useGravatarUrl(viewer?.email, 40);
  // Not clickable: there's no Author id behind this fallback.
  const showViewerAsAuthor =
    !author?.name && !author?.handle && !item.creator && !item.source_provider && Boolean(viewer);
  const authorName =
    author?.name || author?.handle || item.creator || (showViewerAsAuthor ? viewer!.display_name : null);
  const authorAvatarUrl = author?.avatar_url || (showViewerAsAuthor ? viewerAvatarUrl : undefined);
  const providerInfo = printProviderInfo(item.source_provider);
  // Only mounted while hovered, so idle cards don't load images or tick.
  const [hovered, setHovered] = useState(false);
  const slideshowImages =
    item.preview_images.length > 1 ? item.preview_images.map((img) => printsApi.fileUrl(img.url)) : [];

  const authorLink = author || showViewerAsAuthor ? `/authors/${author ? author.id : SELF_AUTHOR_ID}` : null;
  const authorRowSx = { alignItems: "center", minWidth: 0, color: "text.secondary" } as const;
  const authorRow = (
    <>
      <Avatar
        src={authorAvatarUrl || undefined}
        sx={{ width: 20, height: 20, fontSize: 11, color: "inherit !important" }}
      >
        {(authorName || "?").slice(0, 1).toUpperCase()}
      </Avatar>
      <Typography variant="caption" noWrap sx={{ color: "inherit" }}>
        {authorName || t("models:card.unknownAuthor")}
      </Typography>
    </>
  );

  return (
    <Paper
      variant="outlined"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        position: "relative",
        cursor: "pointer",
        overflow: "hidden",
        borderRadius: "14px",
        bgcolor: "background.paper",
        boxShadow: muiTheme.thingport.shadowCard,
        transition: "box-shadow .15s ease, transform .15s ease, border-color .15s ease",
        "&:hover": {
          boxShadow: muiTheme.thingport.shadowHover,
          borderColor: muiTheme.thingport.borderStrong,
          transform: "translateY(-2px)",
        },
        "&:hover .model-card-actions, &:hover .model-card-select, &:focus-within .model-card-select": { opacity: 1 },
        ...(selected && {
          borderColor: "primary.main",
          boxShadow: (th) => `0 0 0 2px ${th.palette.primary.main}`,
        }),
      }}
    >
      <CardLink
        to={`/models/${item.id}`}
        label={item.title || item.name}
        onPlainClick={() => {
          if (!(selectionActive && onToggleSelect)) return false;
          onToggleSelect();
          return true;
        }}
      />
      {/* zIndex 0 makes this its own stacking context, so the slideshow's layered slides stay
          under the provider badge and hover actions rendered after it. */}
      <Box
        sx={{
          position: "relative",
          zIndex: 0,
          width: "100%",
          aspectRatio: "4 / 3",
          bgcolor: muiTheme.thingport.surfaceMuted,
        }}
      >
        {renderPreviewContent(item, "card", theme, t, previewMode)}
        {hovered && slideshowImages.length > 0 && (
          <HoverSlideshow images={slideshowImages} alt={item.title || item.name} />
        )}
      </Box>

      {item.source_provider && (
        <Tooltip
          title={
            item.source_provider
              ? t("models:card.importedFrom", { provider: providerInfo.label })
              : t("models:card.uploadedDirectly")
          }
        >
          <Box
            sx={{
              position: "absolute",
              zIndex: 2,
              pointerEvents: "none",
              top: 8,
              left: onToggleSelect ? 44 : 8,
              px: 1,
              py: 0.375,
              borderRadius: 1,
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1.4,
              color: providerInfo.textColor ?? "#fff",
              bgcolor: providerInfo.color,
            }}
          >
            {providerInfo.label}
          </Box>
        </Tooltip>
      )}

      {onToggleSelect && (
        <Box
          className="model-card-select"
          onClick={(e) => e.stopPropagation()}
          sx={{
            position: "absolute",
            top: 6,
            left: 6,
            zIndex: 3,
            opacity: selectionActive || selected ? 1 : 0,
            transition: "opacity .15s ease",
            bgcolor: "background.paper",
            borderRadius: "8px",
            lineHeight: 0,
          }}
        >
          <Checkbox
            size="small"
            checked={selected}
            onChange={onToggleSelect}
            slotProps={{ input: { "aria-label": t("models:bulk.selectModel", { name: item.title || item.name }) } }}
            sx={{ p: 0.5 }}
          />
        </Box>
      )}
      <Stack
        className="model-card-actions"
        direction="row"
        spacing={0.5}
        onClick={(e) => e.stopPropagation()}
        sx={{
          position: "absolute",
          zIndex: 3,
          top: 8,
          right: 8,
        }}
      >
        <Tooltip title={favoriteLabel}>
          <Box>
            <StarToggle
              active={isFavorite}
              onClick={toggleFavorite}
              ariaLabel={favoriteLabel}
              inactiveColor={overlayIconColor}
              size={HOVER_ICON_SIZE}
              sx={overlayButtonSx}
            />
          </Box>
        </Tooltip>
        <ModelActionsMenu
          print={item}
          onUnauthorized={onUnauthorized}
          onDeleted={() => onDeleted?.(item.id)}
          onUpdated={onUpdated}
          collectionId={collectionId}
          onRemovedFromCollection={() => onRemovedFromCollection?.(item.id)}
          triggerSx={{ color: overlayIconColor, ...overlayButtonSx }}
          iconFontSize={HOVER_ICON_SIZE}
          viewer={viewer}
        />
      </Stack>
      <Box sx={{ px: 1.5, pt: 0.75, pb: 1.5 }}>
        <Stack
          direction="row"
          spacing={0.5}
          sx={{
            alignItems: "center",
          }}
        >
          <Typography
            variant="body2"
            noWrap
            title={item.title || item.name}
            sx={{
              fontWeight: 600,
              color: muiTheme.thingport.headingText,
              flex: 1,
              minWidth: 0,
            }}
          >
            {item.title || item.name}
          </Typography>
          {(item.visibility === "shared" || item.is_owner === false) && (
            <VisibilityBadge
              compact
              visibility={item.visibility}
              ownerName={item.is_owner === false ? item.owner?.display_name : null}
            />
          )}
        </Stack>
        {(() => {
          const exts = [
            ...new Set(
              item.plates
                .map((p) => p.filename.split(".").pop()?.toUpperCase() ?? "")
                .filter((e) => e && e.length <= 5),
            ),
          ];
          const d = item.plates[0]?.dim_mm;
          const dims = d ? `${Math.round(d.x)}×${Math.round(d.y)}×${Math.round(d.z)} mm` : null;
          const fileCount = item.plates.length + (item.supporting_file_count || 0);
          const line1 = [
            exts.length ? exts.join(", ") : null,
            typeof item.total_size === "number" && item.total_size > 0 ? formatFileSize(item.total_size) : null,
            dims,
          ].filter(Boolean);
          const created = item.created_at ? new Date(item.created_at).toLocaleDateString() : null;
          const shownTags = item.tags.slice(0, 3);
          const moreTags = item.tags.length - shownTags.length;
          const processing = item.plates.some(
            (p) => p.processing_status === "queued" || p.processing_status === "processing",
          );
          const failed = item.plates.some((p) => p.processing_status === "failed");
          return (
            <Box sx={{ mt: 0.25 }}>
              {line1.length > 0 && (
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                  {line1.join(" · ")}
                </Typography>
              )}
              <Stack
                direction="row"
                spacing={0.75}
                sx={{
                  alignItems: "center",
                  color: "text.secondary",
                  mt: 0.25,
                  minWidth: 0,
                }}
              >
                {item.category_name && (
                  <Stack
                    direction="row"
                    spacing={0.25}
                    sx={{
                      alignItems: "center",
                      minWidth: 0,
                    }}
                  >
                    <FolderOutlinedIcon sx={{ fontSize: 13 }} />
                    <Typography variant="caption" noWrap title={item.category_name}>
                      {item.category_name}
                    </Typography>
                  </Stack>
                )}
                {fileCount > 1 && (
                  <Typography variant="caption" sx={{ flexShrink: 0 }}>
                    {t("models:card.filesCount", { count: fileCount })}
                  </Typography>
                )}
                {created && (
                  <Typography variant="caption" sx={{ flexShrink: 0, ml: "auto !important" }}>
                    {created}
                  </Typography>
                )}
              </Stack>
              {(shownTags.length > 0 || processing || failed) && (
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: "wrap", rowGap: 0.5 }}>
                  {processing && (
                    <Chip size="small" label={t("models:card.processing")} sx={{ height: 20, fontSize: 11 }} />
                  )}
                  {failed && (
                    <Chip
                      size="small"
                      color="error"
                      variant="outlined"
                      label={t("models:card.processingFailed")}
                      sx={{ height: 20, fontSize: 11 }}
                    />
                  )}
                  {shownTags.map((tag) => (
                    <Chip
                      key={tag}
                      size="small"
                      variant="outlined"
                      label={tag}
                      sx={{ height: 20, fontSize: 11, maxWidth: 110, bgcolor: "background.paper" }}
                    />
                  ))}
                  {moreTags > 0 && (
                    <Chip size="small" variant="outlined" label={`+${moreTags}`} sx={{ height: 20, fontSize: 11 }} />
                  )}
                </Stack>
              )}
            </Box>
          );
        })()}
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            mt: 0.75,
          }}
        >
          <AuthorHoverCard
            authorId={author ? author.id : SELF_AUTHOR_ID}
            viewer={viewer}
            disabled={!author && !showViewerAsAuthor}
          >
            {authorLink ? (
              <Stack
                component={Link}
                to={authorLink}
                direction="row"
                spacing={0.75}
                sx={{ ...authorRowSx, ...aboveCardLink, textDecoration: "none", "&:hover": { color: "primary.main" } }}
              >
                {authorRow}
              </Stack>
            ) : (
              <Stack direction="row" spacing={0.75} sx={authorRowSx}>
                {authorRow}
              </Stack>
            )}
          </AuthorHoverCard>
          <Stack direction="row" spacing={1.5} sx={{ color: "text.secondary", flexShrink: 0 }}>
            <Stack
              direction="row"
              spacing={0.4}
              sx={{
                alignItems: "center",
              }}
            >
              <VisibilityIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption">{item.view_count}</Typography>
            </Stack>
            <Stack
              direction="row"
              spacing={0.4}
              sx={{
                alignItems: "center",
              }}
            >
              <PrintIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption">
                <RollingNumber value={item.print_count} />
              </Typography>
            </Stack>
          </Stack>
        </Stack>
      </Box>
    </Paper>
  );
}
