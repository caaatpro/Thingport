import { useTranslation } from "react-i18next";
import ButtonBase from "@mui/material/ButtonBase";
import Divider from "@mui/material/Divider";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import Tooltip from "@mui/material/Tooltip";
import GridOnIcon from "@mui/icons-material/GridOn";
import ThreeSixtyIcon from "@mui/icons-material/ThreeSixty";
import type { CameraView, RenderStyle } from "../../components/media/ModelViewer";

export const PREVIEW_COLORS = [
  { key: "red", value: "#d32f2f" },
  { key: "orange", value: "#f57c00" },
  { key: "yellow", value: "#fbc02d" },
  { key: "green", value: "#00b800" },
  { key: "blue", value: "#1976d2" },
  { key: "purple", value: "#7b1fa2" },
  { key: "grey", value: "#78909c" },
] as const;

export const DEFAULT_PREVIEW_COLOR = "#00b800";

const CAMERA_VIEWS: CameraView[] = ["topFront", "front", "side", "top", "bottom"];
const RENDER_STYLES: RenderStyle[] = ["solid", "wire", "xray"];

type Props = {
  cameraView: CameraView;
  onCameraView: (view: CameraView) => void;
  renderStyle: RenderStyle;
  onRenderStyleChange: (style: RenderStyle) => void;
  color: string;
  onColorChange: (color: string) => void;
  showGrid: boolean;
  onShowGridChange: (show: boolean) => void;
  spin: boolean;
  onSpinChange: (spin: boolean) => void;
};

const selectSx = { minWidth: 110, fontSize: 14, "& .MuiSelect-select": { py: 0.5 } };

const sectionDivider = <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />;

/** Stateless: the modal owns every value. */
export default function PreviewToolbar({
  cameraView,
  onCameraView,
  renderStyle,
  onRenderStyleChange,
  color,
  onColorChange,
  showGrid,
  onShowGridChange,
  spin,
  onSpinChange,
}: Props) {
  const { t } = useTranslation(["models"]);

  return (
    <Paper
      elevation={3}
      role="toolbar"
      aria-label={t("models:detail.previewToolbar.label") ?? undefined}
      sx={{
        position: "absolute",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 2,
        maxWidth: "calc(100% - 32px)",
        overflowX: "auto",
        px: 1,
        py: 0.75,
        borderRadius: "12px",
      }}
    >
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          alignItems: "center",
          width: "max-content",
        }}
      >
        {/* Selecting goes through MenuItem onClick so re-picking the current view still re-frames,
            since the camera may have been orbited away since. */}
        <Select size="small" value={cameraView} sx={selectSx}>
          {CAMERA_VIEWS.map((view) => (
            <MenuItem key={view} value={view} onClick={() => onCameraView(view)}>
              {t(`models:detail.previewToolbar.${view}`)}
            </MenuItem>
          ))}
        </Select>

        {sectionDivider}

        <Select
          size="small"
          value={renderStyle}
          onChange={(e) => onRenderStyleChange(e.target.value as RenderStyle)}
          sx={selectSx}
        >
          {RENDER_STYLES.map((style) => (
            <MenuItem key={style} value={style}>
              {t(`models:detail.previewToolbar.${style}`)}
            </MenuItem>
          ))}
        </Select>

        {sectionDivider}

        <Stack direction="row" spacing={0.75} sx={{ px: 0.5 }}>
          {PREVIEW_COLORS.map(({ key, value }) => {
            const name = t(`models:detail.previewToolbar.colors.${key}`);
            const selected = value === color;
            return (
              <Tooltip key={key} title={name}>
                <ButtonBase
                  aria-label={t("models:detail.previewToolbar.colorLabel", { name }) ?? undefined}
                  aria-pressed={selected}
                  onClick={() => onColorChange(value)}
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    bgcolor: value,
                    boxShadow: (theme) =>
                      selected
                        ? `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 4px ${theme.palette.text.primary}`
                        : `inset 0 0 0 1px rgba(0, 0, 0, 0.2)`,
                  }}
                />
              </Tooltip>
            );
          })}
        </Stack>

        {sectionDivider}

        <ToggleButton
          size="small"
          value="grid"
          selected={showGrid}
          onChange={() => onShowGridChange(!showGrid)}
          sx={{ px: 1.25, py: 0.5, textTransform: "none", gap: 0.5 }}
        >
          <GridOnIcon fontSize="small" />
          {t("models:detail.previewToolbar.grid")}
        </ToggleButton>

        {sectionDivider}

        <ToggleButton
          size="small"
          value="spin"
          selected={spin}
          onChange={() => onSpinChange(!spin)}
          sx={{ px: 1.25, py: 0.5, textTransform: "none", gap: 0.5 }}
        >
          <ThreeSixtyIcon fontSize="small" />
          {t("models:detail.previewToolbar.spin")}
        </ToggleButton>
      </Stack>
    </Paper>
  );
}
