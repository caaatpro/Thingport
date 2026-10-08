import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { isFileDrag } from "../../utils/dragEvents";
import { entriesFromDataTransfer } from "../../utils/uploadTree";
import { printsApi } from "../../api/prints";
import { UnauthorizedError } from "../../api/client";

type ItemStatus = "uploading" | "ready" | "failed";
type QueueItem = { id: string; name: string; status: ItemStatus; error?: string; printId?: string };

type Props = {
  /** Currently selected category (library view); ignored when dropping on a collection page. */
  categoryId: string | null;
  onUploaded: () => void;
  onUnauthorized: () => void;
};

const SYSTEM_COLLECTION_IDS = new Set(["favorites", "history"]);

function localKey(): string {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    /* insecure context */
  }
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Whole-window drag & drop: drop model files anywhere to upload them into the current context
 *  (a collection when on its page, otherwise the selected category / general library). */
export default function GlobalDropZone({ categoryId, onUploaded, onUnauthorized }: Props) {
  const { t } = useTranslation(["models", "common"]);
  const location = useLocation();
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const dragDepth = useRef(0);

  // Collection id from the route, so a drop while viewing a collection files into it.
  const collectionMatch = location.pathname.match(/^\/models\/collections\/([^/]+)/);
  const collectionId =
    collectionMatch && !SYSTEM_COLLECTION_IDS.has(collectionMatch[1]) ? decodeURIComponent(collectionMatch[1]) : null;

  const activeCount = items.filter((i) => i.status === "uploading").length;

  const update = useCallback((id: string, patch: Partial<QueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const handleFiles = useCallback(
    async (dt: DataTransfer) => {
      const entries = await entriesFromDataTransfer(dt);
      if (!entries.length) return;
      const queued = entries.map((e) => ({ id: localKey(), name: e.file.name, status: "uploading" as ItemStatus }));
      setItems((prev) => [...prev, ...queued]);
      let anySucceeded = false;
      // Sequential: keeps server load sane and the queue readable. One failure never stops the rest.
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const item = queued[i];
        try {
          const res = await printsApi.upload([entry.file], {
            category_id: collectionId ? undefined : categoryId || undefined,
            collection_id: collectionId || undefined,
          });
          update(item.id, { status: "ready", printId: res.prints[0]?.id });
          anySucceeded = true;
        } catch (err) {
          if (err instanceof UnauthorizedError) {
            onUnauthorized();
            update(item.id, { status: "failed", error: t("models:upload.unauthorized") ?? undefined });
            continue;
          }
          update(item.id, { status: "failed", error: err instanceof Error ? err.message : undefined });
        }
      }
      if (anySucceeded) onUploaded();
    },
    [categoryId, collectionId, onUploaded, onUnauthorized, t, update],
  );

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault(); // allow drop
    };
    const onDragLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (e.dataTransfer) void handleFiles(e.dataTransfer);
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleFiles]);

  const dismiss = () => setItems([]);

  return (
    <>
      {dragging && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: (theme) => theme.zIndex.modal + 10,
            bgcolor: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            p: 3,
          }}
        >
          <Box
            sx={{
              border: "3px dashed",
              borderColor: "primary.light",
              borderRadius: 3,
              px: 6,
              py: 5,
              bgcolor: "background.paper",
              textAlign: "center",
              maxWidth: 480,
            }}
          >
            <CloudUploadOutlinedIcon sx={{ fontSize: 56, color: "primary.main", mb: 1 }} />
            <Typography variant="h6">{t("models:upload.dropHere")}</Typography>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                mt: 0.5,
              }}
            >
              {collectionId ? t("models:upload.dropToCollection") : t("models:upload.dropHint")}
            </Typography>
          </Box>
        </Box>
      )}

      {items.length > 0 && (
        <Paper
          elevation={6}
          sx={{
            position: "fixed",
            right: 16,
            bottom: 16,
            zIndex: (theme) => theme.zIndex.modal + 5,
            width: 320,
            maxHeight: 360,
            display: "flex",
            flexDirection: "column",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <Stack
            direction="row"
            sx={{
              alignItems: "center",
              justifyContent: "space-between",
              px: 1.5,
              py: 1,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="subtitle2">
              {activeCount > 0 ? t("models:upload.uploadingCount", { count: activeCount }) : t("models:upload.done")}
            </Typography>
            <IconButton
              size="small"
              onClick={dismiss}
              disabled={activeCount > 0}
              aria-label={t("common:close") ?? undefined}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Box sx={{ overflowY: "auto" }}>
            {items.map((it) => {
              const openable = it.status === "ready" && Boolean(it.printId);
              const open = () => {
                if (openable) navigate(`/models/${it.printId}`);
              };
              return (
                <Stack
                  key={it.id}
                  direction="row"
                  spacing={1}
                  onClick={open}
                  role={openable ? "button" : undefined}
                  tabIndex={openable ? 0 : undefined}
                  onKeyDown={openable ? (e) => (e.key === "Enter" || e.key === " ") && open() : undefined}
                  title={it.error || (openable ? t("models:upload.openHint") : it.name)}
                  sx={{
                    alignItems: "center",
                    px: 1.5,
                    py: 0.75,
                    ...(openable ? { cursor: "pointer", "&:hover": { bgcolor: "action.hover" } } : {}),
                  }}
                >
                  {it.status === "uploading" && <CircularProgress size={16} />}
                  {it.status === "ready" && <CheckCircleIcon fontSize="small" color="success" />}
                  {it.status === "failed" && <ErrorOutlinedIcon fontSize="small" color="error" />}
                  <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                    {it.name}
                  </Typography>
                  {openable ? (
                    <OpenInNewIcon fontSize="small" sx={{ color: "text.secondary", fontSize: 16 }} />
                  ) : (
                    <Typography variant="caption" color={it.status === "failed" ? "error" : "text.secondary"}>
                      {t(`models:upload.status.${it.status}`)}
                    </Typography>
                  )}
                </Stack>
              );
            })}
          </Box>
        </Paper>
      )}
    </>
  );
}
