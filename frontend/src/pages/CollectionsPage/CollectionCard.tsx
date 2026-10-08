import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Theme } from "@mui/material/styles";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LockIcon from "@mui/icons-material/Lock";
import { type Collection } from "../../api/collections";
import { type PreviewMode } from "../../api/settings";
import { type ResolvedTheme } from "../../constants/settingsOptions";
import { renderPreviewContent } from "../../components/media/renderPreviewContent";
import { collectionDisplayName } from "../../utils/collectionDisplay";
import CollectionActionsMenu from "../CollectionDetailPage/CollectionActionsMenu";
import VisibilityBadge from "../../components/VisibilityBadge";

type Props = {
  collection: Collection;
  theme: ResolvedTheme;
  previewMode: PreviewMode;
  onUpdated: (collection: Collection) => void;
  onDeleted: (id: string) => void;
  onUnauthorized?: () => void;
  onBookmarksChanged?: () => void;
};

const COVER_TILE_LIMIT = 4;

/** Opens that model directly, separate from the card's own click target. */
function CoverTile({
  print,
  theme,
  previewMode,
  overlayCount,
}: {
  print: Collection["cover_items"][number];
  theme: ResolvedTheme;
  previewMode: PreviewMode;
  overlayCount?: number;
}) {
  const { t } = useTranslation(["models", "common"]);
  const navigate = useNavigate();
  return (
    <Box
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/models/${print.id}`);
      }}
      sx={{ position: "relative", width: "100%", height: "100%", cursor: "pointer", overflow: "hidden" }}
    >
      {renderPreviewContent(print, "card", theme, t, previewMode)}
      {Boolean(overlayCount && overlayCount > 0) && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "rgba(0, 0, 0, 0.55)",
          }}
        >
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 700,
              color: "#fff",
            }}
          >
            +{overlayCount}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// Two cards peeking out below so a collection reads as a stack. Back to front.
const STACK_LAYERS = [
  { insetPx: 20, dropPx: 12, opacity: 0.55 },
  { insetPx: 10, dropPx: 6, opacity: 0.8 },
];
const STACK_DEPTH_PX = Math.max(...STACK_LAYERS.map((layer) => layer.dropPx));

const cardBackground = (muiTheme: Theme) =>
  muiTheme.palette.mode === "dark" ? muiTheme.thingport.pageBackground : muiTheme.palette.grey[100];

export default function CollectionCard({
  collection,
  theme,
  previewMode,
  onUpdated,
  onDeleted,
  onUnauthorized,
  onBookmarksChanged,
}: Props) {
  const { t } = useTranslation(["models", "common"]);
  const navigate = useNavigate();
  const coverItems = collection.cover_items.slice(0, COVER_TILE_LIMIT);
  const extraCount = collection.item_count > COVER_TILE_LIMIT ? collection.item_count - COVER_TILE_LIMIT : 0;
  const displayName = collectionDisplayName(collection, t);
  // With a single model, go straight to it.
  const soleModelId = collection.item_count === 1 ? coverItems[0]?.id : undefined;
  const openTarget = soleModelId ? `/models/${soleModelId}` : `/models/collections/${collection.id}`;

  return (
    <Box sx={{ position: "relative", pb: `${STACK_DEPTH_PX}px` }}>
      {STACK_LAYERS.map(({ insetPx, dropPx, opacity }) => (
        <Box
          key={dropPx}
          aria-hidden
          sx={{
            position: "absolute",
            top: 0,
            left: insetPx,
            right: insetPx,
            bottom: STACK_DEPTH_PX - dropPx,
            borderRadius: "12px",
            border: "1px solid",
            borderColor: "divider",
            bgcolor: cardBackground,
            opacity,
          }}
        />
      ))}
      <Paper
        variant="outlined"
        sx={{
          position: "relative",
          overflow: "hidden",
          borderRadius: "12px",
          borderColor: "divider",
          bgcolor: cardBackground,
          "&:hover .collection-card-actions": { opacity: 1 },
        }}
      >
        <Box
          sx={{
            width: "100%",
            aspectRatio: "4 / 3",
            bgcolor: (muiTheme) =>
              muiTheme.palette.mode === "dark" ? muiTheme.thingport.pageBackground : muiTheme.palette.grey[200],
          }}
        >
          {coverItems.length === 0 && (
            <Stack
              sx={{
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%",
                color: "text.disabled",
              }}
            >
              <Typography variant="caption">{t("models:collections.card.empty")}</Typography>
            </Stack>
          )}
          {coverItems.length === 1 && <CoverTile print={coverItems[0]} theme={theme} previewMode={previewMode} />}
          {coverItems.length > 1 && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gridTemplateRows: "repeat(2, 1fr)",
                gap: "2px",
                width: "100%",
                height: "100%",
              }}
            >
              {coverItems.map((item, idx) => (
                <CoverTile
                  key={item.id}
                  print={item}
                  theme={theme}
                  previewMode={previewMode}
                  overlayCount={idx === coverItems.length - 1 ? extraCount : undefined}
                />
              ))}
            </Box>
          )}
        </Box>

        {!collection.system_key && (
          <Box
            className="collection-card-actions"
            onClick={(e) => e.stopPropagation()}
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              opacity: 0,
              transition: "opacity .15s ease",
              bgcolor: "rgba(0, 0, 0, 0.55)",
              borderRadius: "50%",
            }}
          >
            <CollectionActionsMenu
              collection={collection}
              onUpdated={onUpdated}
              onDeleted={() => onDeleted(collection.id)}
              onUnauthorized={onUnauthorized}
              onBookmarksChanged={onBookmarksChanged}
              triggerSx={{ color: "#fff" }}
            />
          </Box>
        )}

        <Box
          onClick={() => navigate(openTarget)}
          sx={{
            p: 1.5,
            cursor: "pointer",
            transition: "background-color .15s ease",
            "&:hover": { bgcolor: "background.paper" },
          }}
        >
          <Stack
            direction="row"
            spacing={0.5}
            sx={{
              alignItems: "center",
              minWidth: 0,
            }}
          >
            {collection.system_key && <LockIcon sx={{ fontSize: 14, color: "text.disabled", flexShrink: 0 }} />}
            <Typography
              variant="body2"
              noWrap
              title={displayName}
              sx={{
                fontWeight: 600,
                color: (muiTheme) => muiTheme.thingport.headingText,
                flex: 1,
                minWidth: 0,
              }}
            >
              {displayName}
            </Typography>
            {!collection.system_key && (collection.visibility === "shared" || collection.is_owner === false) && (
              <VisibilityBadge
                compact
                visibility={collection.visibility}
                ownerName={collection.is_owner === false ? collection.owner?.display_name : null}
              />
            )}
          </Stack>
          <Stack
            direction="row"
            spacing={0.5}
            sx={{
              alignItems: "center",
              mt: 0.5,
              color: "#858585",
            }}
          >
            <Inventory2OutlinedIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption">
              {t("models:collections.card.itemCount", { count: collection.item_count })}
            </Typography>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
