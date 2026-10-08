import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PrintIcon from "@mui/icons-material/Print";
import { type Print } from "../../api/prints";
import { type PreviewMode } from "../../api/settings";
import { type ResolvedTheme } from "../../constants/settingsOptions";
import type { AuthUser } from "../../api/auth";
import { renderPreviewContent } from "../../components/media/renderPreviewContent";
import CardLink, { aboveCardLink } from "../../components/CardLink";
import StarToggle from "../../components/StarToggle";
import VisibilityBadge from "../../components/VisibilityBadge";
import { useFavoriteToggle } from "../../hooks/useFavoriteToggle";
import { formatFileSize } from "../../utils/fileSize";
import ModelActionsMenu from "../ModelDetailPage/ModelActionsMenu";

type Props = {
  item: Print;
  theme: ResolvedTheme;
  previewMode: PreviewMode;
  onDeleted?: (id: string) => void;
  onFavoriteChange?: (print: Print) => void;
  onUpdated?: (print: Print) => void;
  onUnauthorized?: () => void;
  viewer?: AuthUser | null;
  selected?: boolean;
  selectionActive?: boolean;
  onToggleSelect?: () => void;
};

/** One model per line, for scanning long libraries. Same actions as the card. */
export default function ModelRow({
  item,
  theme,
  previewMode,
  onDeleted,
  onFavoriteChange,
  onUpdated,
  onUnauthorized,
  viewer,
  selected = false,
  selectionActive = false,
  onToggleSelect,
}: Props) {
  const { t } = useTranslation(["models", "common"]);
  const muiTheme = useTheme();
  const { isFavorite, toggle, label } = useFavoriteToggle(item, { onUpdated: onFavoriteChange, onUnauthorized });
  const d = item.plates[0]?.dim_mm;
  const meta = [
    [
      ...new Set(
        item.plates.map((p) => p.filename.split(".").pop()?.toUpperCase() ?? "").filter((e) => e && e.length <= 5),
      ),
    ].join(", "),
    typeof item.total_size === "number" && item.total_size > 0 ? formatFileSize(item.total_size) : null,
    d ? `${Math.round(d.x)}×${Math.round(d.y)}×${Math.round(d.z)} mm` : null,
    item.category_name,
  ].filter(Boolean);
  const authorName = item.author?.name || item.author?.handle || item.creator || null;

  return (
    <Box
      sx={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 1,
        pr: 1.5,
        bgcolor: "background.paper",
        border: 1,
        borderColor: selected ? "primary.main" : "divider",
        borderRadius: "12px",
        "&:hover": { borderColor: selected ? "primary.main" : muiTheme.thingport.borderStrong },
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
      {onToggleSelect ? (
        <Box onClick={(e) => e.stopPropagation()} sx={{ lineHeight: 0, ...aboveCardLink }}>
          <Checkbox
            size="small"
            checked={selected}
            onChange={onToggleSelect}
            slotProps={{ input: { "aria-label": t("models:bulk.selectModel", { name: item.title || item.name }) } }}
          />
        </Box>
      ) : (
        <Box sx={{ width: 38, flexShrink: 0 }} />
      )}
      <Box
        sx={{
          position: "relative",
          width: 96,
          height: 72,
          flexShrink: 0,
          borderRadius: "8px",
          overflow: "hidden",
          bgcolor: muiTheme.thingport.surfaceMuted,
        }}
      >
        {renderPreviewContent(item, "card", theme, t, previewMode)}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <Typography variant="body2" noWrap title={item.title || item.name} sx={{ fontWeight: 600, minWidth: 0 }}>
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
        <Typography variant="caption" noWrap sx={{ color: "text.secondary", display: "block" }}>
          {meta.join(" · ")}
          {authorName ? ` · ${authorName}` : ""}
        </Typography>
      </Box>
      <Stack direction="row" spacing={0.5} sx={{ display: { xs: "none", lg: "flex" }, flexShrink: 0 }}>
        {item.tags.slice(0, 3).map((tag) => (
          <Chip key={tag} size="small" variant="outlined" label={tag} sx={{ height: 22, maxWidth: 110 }} />
        ))}
        {item.tags.length > 3 && (
          <Chip size="small" variant="outlined" label={`+${item.tags.length - 3}`} sx={{ height: 22 }} />
        )}
      </Stack>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ color: "text.secondary", flexShrink: 0, alignItems: "center", minWidth: 110, justifyContent: "flex-end" }}
      >
        <Stack direction="row" spacing={0.4} sx={{ alignItems: "center" }}>
          <VisibilityIcon sx={{ fontSize: 14 }} />
          <Typography variant="caption">{item.view_count}</Typography>
        </Stack>
        <Stack direction="row" spacing={0.4} sx={{ alignItems: "center" }}>
          <PrintIcon sx={{ fontSize: 14 }} />
          <Typography variant="caption">{item.print_count}</Typography>
        </Stack>
      </Stack>
      <Typography variant="caption" sx={{ color: "text.secondary", width: 76, flexShrink: 0, textAlign: "right" }}>
        {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
      </Typography>
      <Stack
        direction="row"
        spacing={0.5}
        onClick={(e) => e.stopPropagation()}
        sx={{ flexShrink: 0, ...aboveCardLink }}
      >
        <StarToggle active={isFavorite} onClick={toggle} ariaLabel={label} size={20} />
        <ModelActionsMenu
          print={item}
          onUnauthorized={onUnauthorized}
          onDeleted={() => onDeleted?.(item.id)}
          onUpdated={onUpdated}
          viewer={viewer}
        />
      </Stack>
    </Box>
  );
}
