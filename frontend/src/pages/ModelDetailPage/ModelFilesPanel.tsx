import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import DownloadIcon from "@mui/icons-material/Download";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import { UnauthorizedError } from "../../api/client";
import { type Plate, type Print, type PrintFile, printsApi } from "../../api/prints";
import { dividerBorderColor } from "../../theme";
import { extOf } from "../../utils/fileExtensions";
import { formatFileSize } from "../../utils/fileSize";
import { saveResponseToDisk } from "../../utils/downloadResponse";
import PlateThumbnail from "../../components/media/PlateThumbnail";
import { useDownloadPrint } from "./useDownloadPrint";

type Props = {
  print: Print;
  onUnauthorized?: () => void;
  onUpdated?: (print: Print) => void;
};

function plateMeta(plate: Plate, t: TFunction): string {
  const parts: string[] = [];
  const type = extOf(plate.filename).toUpperCase();
  if (type) parts.push(type);
  parts.push(formatFileSize(plate.size));
  if (plate.dim_mm) {
    parts.push(`${Math.round(plate.dim_mm.x)}×${Math.round(plate.dim_mm.y)}×${Math.round(plate.dim_mm.z)} mm`);
  }
  if (plate.triangle_count) {
    parts.push(
      t("models:files.triangles", { count: plate.triangle_count, formatted: plate.triangle_count.toLocaleString() }),
    );
  }
  return parts.join(" · ");
}

/** Every file of the model, visible straight away on the detail page (not hidden behind the 3D
 *  viewer or the download picker): model plates, supporting files and the prepared (sliced) file. */
export default function ModelFilesPanel({ print, onUnauthorized, onUpdated }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const { sortedPlates, downloadPlate, downloadAllZip, downloading } = useDownloadPrint(
    print,
    onUnauthorized,
    onUpdated,
  );
  const [supporting, setSupporting] = useState<PrintFile[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!print.supporting_file_count) {
      setSupporting([]);
      return;
    }
    let cancelled = false;
    printsApi
      .listFiles(print.id)
      .then((files) => !cancelled && setSupporting(files))
      .catch(() => !cancelled && setSupporting([]));
    return () => {
      cancelled = true;
    };
  }, [print.id, print.supporting_file_count]);

  const downloadExtra = async (id: string, url: string, filename: string) => {
    setBusyId(id);
    try {
      const res = await fetch(printsApi.fileUrl(url));
      if (res.status === 401) throw new UnauthorizedError();
      if (!res.ok) throw new Error("Download failed");
      await saveResponseToDisk(res, filename || "download");
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized?.();
      } else {
        console.error(err);
        alert(t("models:detail.downloadFailed"));
      }
    } finally {
      setBusyId(null);
    }
  };

  const preparedSeparate = Boolean(print.prepared_print?.removable && print.slicer_url);
  const totalFiles = sortedPlates.length + supporting.length + (preparedSeparate ? 1 : 0);
  if (!totalFiles) return null;

  return (
    <Paper variant="outlined" sx={{ mt: 3, p: 2, borderRadius: "12px", borderColor: dividerBorderColor }}>
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
        }}
      >
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 700,
            color: (muiTheme) => muiTheme.thingport.headingText,
          }}
        >
          {t("models:files.title", { count: totalFiles })}
        </Typography>
        {totalFiles > 1 && (
          <Button
            size="small"
            variant="outlined"
            onClick={downloadAllZip}
            disabled={downloading}
            startIcon={downloading ? <CircularProgress size={14} /> : <DownloadIcon fontSize="small" />}
          >
            {t("models:files.downloadAll")}
          </Button>
        )}
      </Stack>

      <Stack divider={<Divider flexItem />} spacing={0}>
        {sortedPlates.map((plate) => {
          const failed = plate.processing_status === "failed";
          const pending = plate.processing_status === "queued" || plate.processing_status === "processing";
          return (
            <Stack
              key={plate.id}
              direction="row"
              spacing={1.5}
              sx={{
                alignItems: "center",
                py: 1,
              }}
            >
              <PlateThumbnail plate={plate} size={48} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  noWrap
                  title={plate.filename}
                  sx={{
                    fontWeight: 600,
                  }}
                >
                  {plate.filename}
                </Typography>
                <Typography
                  variant="caption"
                  noWrap
                  sx={{
                    color: "text.secondary",
                    display: "block",
                  }}
                >
                  {plateMeta(plate, t)}
                </Typography>
              </Box>
              {pending && (
                <Chip size="small" label={t("models:files.processing")} icon={<CircularProgress size={12} />} />
              )}
              {failed && <Chip size="small" color="error" variant="outlined" label={t("models:files.failed")} />}
              <Tooltip title={t("common:download")}>
                <span>
                  <IconButton size="small" onClick={() => void downloadPlate(plate)} disabled={downloading}>
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          );
        })}

        {preparedSeparate && (
          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              alignItems: "center",
              py: 1,
            }}
          >
            <Box sx={{ width: 48, height: 48, display: "grid", placeItems: "center", color: "text.secondary" }}>
              <AttachFileIcon />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body2"
                noWrap
                title={print.slicer_filename ?? undefined}
                sx={{
                  fontWeight: 600,
                }}
              >
                {print.slicer_filename}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                }}
              >
                {t("models:files.prepared")}
              </Typography>
            </Box>
            <Tooltip title={t("common:download")}>
              <span>
                <IconButton
                  size="small"
                  onClick={() => void downloadExtra("prepared", print.slicer_url!, print.slicer_filename || "prepared")}
                  disabled={busyId === "prepared"}
                >
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        )}

        {supporting.map((file) => (
          <Stack
            key={file.id}
            direction="row"
            spacing={1.5}
            sx={{
              alignItems: "center",
              py: 1,
            }}
          >
            <Box sx={{ width: 48, height: 48, display: "grid", placeItems: "center", color: "text.secondary" }}>
              <AttachFileIcon />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body2"
                noWrap
                title={file.filename}
                sx={{
                  fontWeight: 600,
                }}
              >
                {file.filename}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                }}
              >
                {`${t("models:files.supporting")} · ${formatFileSize(file.size)}`}
              </Typography>
            </Box>
            <Tooltip title={t("common:download")}>
              <span>
                <IconButton
                  size="small"
                  onClick={() => void downloadExtra(file.id, file.url, file.filename)}
                  disabled={busyId === file.id}
                >
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}
