import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Theme } from "@mui/material/styles";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Collapse from "@mui/material/Collapse";
import CircularProgress from "@mui/material/CircularProgress";
import SettingsIcon from "@mui/icons-material/Settings";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import type { Category, CategoryMetaInput } from "../../api/categories";
import { dividerBorderColor } from "../../theme";
import { ancestorPath, buildCategoryTree } from "../../utils/categoryTree";
import CategoryManagerModal from "./CategoryManagerModal";

type Props = {
  categories: Category[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (name: string, parentId: string | null) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (categoryIds: string[]) => Promise<void>;
  onMove: (id: string, parentId: string | null, position: number) => Promise<void>;
  onUpdateMeta: (id: string, meta: CategoryMetaInput) => Promise<void>;
};

function rowSx(active: boolean) {
  return {
    borderRadius: 1.5,
    mb: 0.25,
    background: (theme: Theme) => (active ? theme.thingport.selectedNavBackground : "transparent"),
    ...(active
      ? { "&:hover": { background: (theme: Theme) => theme.thingport.selectedNavBackground } }
      : {
          // Dark mode: brighten the label instead of tinting the background on hover.
          "&:hover": (theme: Theme) =>
            theme.palette.mode === "dark"
              ? { backgroundColor: "transparent", "& .MuiListItemText-primary, & .MuiSvgIcon-root": { color: "#fff" } }
              : { bgcolor: "action.hover" },
        }),
  };
}
function rowTextSx(active: boolean, extra?: object) {
  return {
    noWrap: true,
    variant: "body2" as const,
    sx: {
      color: (theme: Theme) => (active ? theme.thingport.selectedNavText : theme.thingport.navInactiveText),
      ...extra,
    },
  };
}

/** Any depth; a category selects the models at every level beneath it. Only the selected path is open. */
export default function CategoriesPanel({
  categories,
  loading,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onReorder,
  onMove,
  onUpdateMeta,
}: Props) {
  const { t } = useTranslation(["models", "common"]);
  const [managerOpen, setManagerOpen] = useState(false);

  const untitledLabel = t("models:categories.untitled");

  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  // The selected category and its ancestors are open, so a selection from the URL is always visible.
  const openIds = useMemo(
    () => new Set(selectedId && tree.byId.has(selectedId) ? ancestorPath(tree, selectedId) : []),
    [tree, selectedId],
  );

  const renderCategory = (category: Category, depth: number) => {
    const children = tree.childrenByParent[category.id] ?? [];
    const isRoot = depth === 0;
    const isOpen = openIds.has(category.id);
    const isSelected = selectedId === category.id;
    return (
      <Stack key={category.id}>
        <ListItemButton onClick={() => onSelect(category.id)} sx={{ pl: 1 + depth * 2, ...rowSx(isSelected) }}>
          <ListItemText
            primary={category.name || untitledLabel}
            slotProps={{
              primary: rowTextSx(
                isSelected,
                isRoot ? { fontWeight: 600 } : isSelected ? { fontWeight: 700 } : undefined,
              ),
            }}
          />
          {(isRoot || children.length > 0) && (
            <ChevronRightIcon
              fontSize="small"
              sx={{
                ml: 0.5,
                flexShrink: 0,
                transform: isOpen ? "rotate(90deg)" : "none",
                transition: "transform 0.15s",
                color: (theme) => (isSelected ? theme.thingport.selectedNavText : theme.thingport.navInactiveText),
              }}
            />
          )}
        </ListItemButton>
        <Collapse in={isOpen} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {children.map((child) => renderCategory(child, depth + 1))}
            {isRoot && !children.length && (
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  pl: 4,
                  display: "block",
                  py: 0.5,
                }}
              >
                {t("models:categories.noSubcategories")}
              </Typography>
            )}
          </List>
        </Collapse>
      </Stack>
    );
  };

  return (
    <>
      <Paper
        variant="outlined"
        sx={{
          width: 260,
          flexShrink: 0,
          borderRadius: "12px",
          p: 1.5,
          alignSelf: "flex-start",
          bgcolor: "background.paper",
          borderColor: dividerBorderColor,
        }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            px: 0.5,
            pb: 1,
          }}
        >
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 700,
            }}
          >
            {t("models:categories.title")}
          </Typography>
          <Tooltip title={t("models:categories.manageTooltip") ?? ""}>
            <IconButton
              size="small"
              onClick={() => setManagerOpen(true)}
              aria-label={t("models:categories.manageTooltip") ?? undefined}
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        <List disablePadding>
          <ListItemButton onClick={() => onSelect(null)} sx={rowSx(selectedId === null)}>
            <ListItemText
              primary={t("models:categories.all")}
              slotProps={{
                primary: rowTextSx(selectedId === null, { fontWeight: 600 }),
              }}
            />
          </ListItemButton>

          {loading && (
            <Stack
              sx={{
                alignItems: "center",
                py: 2,
              }}
            >
              <CircularProgress size={18} />
            </Stack>
          )}

          {!loading && tree.roots.map((root) => renderCategory(root, 0))}

          {!loading && !tree.roots.length && (
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                px: 1,
                py: 1,
              }}
            >
              {t("models:categories.empty")}
            </Typography>
          )}
        </List>
      </Paper>

      {managerOpen && (
        <CategoryManagerModal
          categories={categories}
          onClose={() => setManagerOpen(false)}
          onCreate={onCreate}
          onRename={onRename}
          onDelete={onDelete}
          onReorder={onReorder}
          onMove={onMove}
          onUpdateMeta={onUpdateMeta}
        />
      )}
    </>
  );
}
