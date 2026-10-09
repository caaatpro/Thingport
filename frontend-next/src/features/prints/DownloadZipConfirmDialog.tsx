import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { printsApi, type DownloadZipFilter } from "@/api/prints";
import { errorMessage } from "@/app/queryClient";
import { Alert, Button, Modal, Spinner } from "@/ui";
import { saveResponseToDisk } from "@/utils/downloadResponse";
import { formatFileSize } from "@/utils/fileSize";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: DownloadZipFilter;
  filename: string;
  title: string;
};

/** Shows the model count and an approximate size before building the zip. */
export function DownloadZipConfirmDialog({ open, onOpenChange, filter, filename, title }: Props) {
  const summary = useQuery({
    queryKey: ["download-zip-summary", filter],
    queryFn: () => printsApi.downloadZipSummary(filter),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });
  const download = useMutation({
    mutationFn: async () => {
      const res = await printsApi.downloadZip({ ...filter, filename });
      await saveResponseToDisk(res, filename);
    },
    onSuccess: () => onOpenChange(false),
  });

  const loading = summary.isPending && open;
  const busy = loading || download.isPending;
  const count = summary.data?.count ?? null;
  const sizeBytes = summary.data?.size_bytes || null;
  const empty = count === 0;
  const plural = count === 1 ? "model" : "models";

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      locked={busy}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => download.mutate()}
            disabled={busy || empty || summary.isError}
            icon={download.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
          >
            {download.isPending ? "Downloading…" : "Download"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Spinner className="size-4" label="Calculating" />
            Calculating…
          </div>
        ) : null}
        {summary.isError ? <Alert tone="danger">Couldn't calculate the download size. Try again.</Alert> : null}
        {summary.data && empty ? <Alert>No downloadable model files found.</Alert> : null}
        {summary.data && !empty && count !== null ? (
          <p className="text-sm text-fg">
            {sizeBytes ? `${count} ${plural} (~${formatFileSize(sizeBytes)})` : `${count} ${plural}`}
          </p>
        ) : null}
        {download.isError ? <Alert tone="danger">{errorMessage(download.error, "Couldn't download the zip file. Try again.")}</Alert> : null}
      </div>
    </Modal>
  );
}
