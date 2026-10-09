import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, CloudUpload, ExternalLink, Loader2, X, XCircle } from "lucide-react";
import { UnauthorizedError } from "@/api/client";
import { printsApi } from "@/api/prints";
import { useAuth } from "@/app/auth";
import { IconButton } from "@/ui";
import { isFileDrag } from "@/utils/dragEvents";
import { entriesFromDataTransfer } from "@/utils/uploadTree";
import { useInvalidateLibrary } from "./invalidate";
import { queueReducer, queueTitle, runUploadQueue, type QueueItem } from "./uploadQueue";
import { useImportTarget } from "./useImportTarget";

let localCounter = 0;
const localId = () => `drop-${Date.now().toString(36)}-${localCounter++}`;

/**
 * Whole-window drag and drop: drop model files anywhere to upload them into the current context (the collection
 * on its page, otherwise the selected category or the general library). Shows an overlay while dragging and a
 * small queue panel with per-file status afterwards.
 */
export function GlobalDropZone() {
  const { categoryId, collectionId } = useImportTarget();
  const { onUnauthorized } = useAuth();
  const invalidateLibrary = useInvalidateLibrary();
  const [dragging, setDragging] = useState(false);
  const [items, dispatch] = useReducer(queueReducer, [] as QueueItem[]);
  const dragDepth = useRef(0);

  const handleDrop = useCallback(
    async (dataTransfer: DataTransfer) => {
      const entries = await entriesFromDataTransfer(dataTransfer);
      if (!entries.length) return;
      const queued = entries.map((entry) => ({ id: localId(), payload: entry.file }));
      dispatch({ type: "add", items: queued.map(({ id, payload }) => ({ id, name: payload.name, status: "uploading" })) });
      const succeeded = await runUploadQueue(
        queued,
        async (file) => {
          const res = await printsApi.upload([file], {
            category_id: collectionId ? undefined : categoryId || undefined,
            collection_id: collectionId || undefined,
          });
          return { printId: res.prints[0]?.id };
        },
        dispatch,
        (err) => {
          const unauthorized = err instanceof UnauthorizedError;
          if (unauthorized) onUnauthorized();
          return unauthorized;
        },
      );
      if (succeeded) void invalidateLibrary();
    },
    [categoryId, collectionId, onUnauthorized, invalidateLibrary],
  );

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (isFileDrag(e)) e.preventDefault(); // allow the drop
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
      if (e.dataTransfer) void handleDrop(e.dataTransfer);
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
  }, [handleDrop]);

  const active = items.some((i) => i.status === "uploading");

  return (
    <>
      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-6 backdrop-blur-[2px]">
          <div className="max-w-md rounded-dialog border-2 border-dashed border-accent bg-surface px-10 py-8 text-center shadow-overlay">
            <CloudUpload className="mx-auto mb-2 size-12 text-accent-text" aria-hidden />
            <p className="text-lg font-semibold text-fg">Drop models to upload</p>
            <p className="mt-1 text-sm text-muted">
              {collectionId ? "They'll be added to this collection" : "They'll be added to your library"}
            </p>
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <section
          aria-label="Uploads"
          className="fixed right-4 bottom-4 z-[60] flex max-h-[360px] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-card border border-border bg-surface shadow-overlay"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border py-1.5 pr-1.5 pl-3">
            <output className="text-sm font-medium text-fg">{queueTitle(items)}</output>
            <IconButton label="Close" size="sm" onClick={() => dispatch({ type: "clearFinished" })} disabled={active}>
              <X className="size-4" aria-hidden />
            </IconButton>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-2 px-3 py-1.5 text-sm" title={item.error || item.name}>
                {item.status === "uploading" ? <Loader2 className="size-4 shrink-0 animate-spin text-subtle" aria-hidden /> : null}
                {item.status === "ready" ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden /> : null}
                {item.status === "failed" ? <XCircle className="size-4 shrink-0 text-danger" aria-hidden /> : null}
                {item.status === "ready" && item.printId ? (
                  <Link to={`/models/${item.printId}`} className="flex min-w-0 flex-1 items-center gap-1.5 text-fg hover:underline">
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <ExternalLink className="size-3.5 shrink-0 text-subtle" aria-hidden />
                    <span className="sr-only">Open model</span>
                  </Link>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-fg">{item.name}</span>
                    <span className={item.status === "failed" ? "shrink-0 text-xs text-danger" : "shrink-0 text-xs text-muted"}>
                      {item.status === "failed" ? "Failed" : item.status === "ready" ? "Ready" : "Uploading"}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
