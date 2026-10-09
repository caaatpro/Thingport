import type { MouseEvent, ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Loader2, Paperclip } from "lucide-react";
import { UnauthorizedError } from "@/api/client";
import { printsApi, type Plate, type Print } from "@/api/prints";
import PlateThumbnail from "@/features/media/PlateThumbnail";
import { useDownloadPrint } from "@/features/prints";
import { Badge, Button, Card, CardHeader, IconButton, cn, useToast } from "@/ui";
import { saveResponseToDisk } from "@/utils/downloadResponse";
import { extOf } from "@/utils/fileExtensions";
import { formatFileSize } from "@/utils/fileSize";
import { preparedSummary } from "./preparedInfo";

export function plateMeta(plate: Plate): string {
  const parts: string[] = [];
  const type = extOf(plate.filename).toUpperCase();
  if (type) parts.push(type);
  parts.push(formatFileSize(plate.size));
  if (plate.dim_mm)
    parts.push(`${Math.round(plate.dim_mm.x)}×${Math.round(plate.dim_mm.y)}×${Math.round(plate.dim_mm.z)} mm`);
  if (plate.triangle_count) {
    parts.push(`${plate.triangle_count.toLocaleString()} ${plate.triangle_count === 1 ? "triangle" : "triangles"}`);
  }
  return parts.join(" · ");
}

/** A real download link (so it can be opened in a new tab or copied); a plain click downloads in place. */
function DownloadLink({
  href,
  filename,
  busy,
  onDownload,
}: {
  href: string;
  filename: string;
  busy?: boolean;
  onDownload: () => void;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    if (!busy) onDownload();
  };
  return (
    <IconButton label={`Download ${filename}`} size="sm" asChild>
      <a
        href={href}
        download={filename}
        onClick={onClick}
        aria-disabled={busy || undefined}
        className={cn(busy && "pointer-events-none opacity-50")}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
      </a>
    </IconButton>
  );
}

function Row({ lead, name, meta, trailing }: { lead: ReactNode; name: string; meta: string; trailing: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2">
      {lead}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg" title={name}>
          {name}
        </p>
        <p className="truncate text-xs text-muted">{meta}</p>
      </div>
      {trailing}
    </li>
  );
}

const attachmentIcon = (
  <span className="flex size-12 shrink-0 items-center justify-center text-muted">
    <Paperclip className="size-5" aria-hidden />
  </span>
);

/** Every file of the model, visible straight away: model plates, the prepared (sliced) file and supporting files. */
export function ModelFilesPanel({ print }: { print: Print }) {
  const toast = useToast();
  const { sortedPlates, downloadPlate, downloadAllZip, downloading } = useDownloadPrint(print);

  const supportingQuery = useQuery({
    queryKey: ["print", print.id, "files", print.supporting_file_count],
    queryFn: () => printsApi.listFiles(print.id),
    enabled: print.supporting_file_count > 0,
  });
  const supporting = print.supporting_file_count > 0 ? (supportingQuery.data ?? []) : [];

  const extra = useMutation({
    mutationFn: async (file: { id: string; url: string; filename: string }) => {
      const res = await fetch(printsApi.fileUrl(file.url));
      if (res.status === 401) throw new UnauthorizedError();
      if (!res.ok) throw new Error("Download failed");
      await saveResponseToDisk(res, file.filename || "download");
    },
    onError: (err) => {
      if (!(err instanceof UnauthorizedError)) toast.error("Download failed. Try again.");
    },
  });
  const busyId = extra.isPending ? extra.variables?.id : undefined;

  const preparedSeparate = Boolean(print.prepared_print?.removable && print.slicer_url);
  const total = sortedPlates.length + supporting.length + (preparedSeparate ? 1 : 0);
  if (!total) return null;

  return (
    <Card>
      <CardHeader
        title={`${total === 1 ? "File" : "Files"} (${total})`}
        actions={
          total > 1 ? (
            <Button
              size="sm"
              onClick={downloadAllZip}
              loading={downloading}
              icon={<Download className="size-4" aria-hidden />}
            >
              Download all (zip)
            </Button>
          ) : undefined
        }
      />
      <ul className="divide-y divide-border">
        {sortedPlates.map((plate) => {
          const pending = plate.processing_status === "queued" || plate.processing_status === "processing";
          return (
            <Row
              key={plate.id}
              lead={<PlateThumbnail plate={plate} size={48} />}
              name={plate.filename}
              meta={plateMeta(plate)}
              trailing={
                <>
                  {pending ? (
                    <Badge tone="neutral">
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                      Processing
                    </Badge>
                  ) : null}
                  {plate.processing_status === "failed" ? <Badge tone="danger">Processing failed</Badge> : null}
                  <DownloadLink
                    href={printsApi.fileUrl(plate.url)}
                    filename={plate.filename}
                    busy={downloading}
                    onDownload={() => downloadPlate(plate)}
                  />
                </>
              }
            />
          );
        })}

        {preparedSeparate && print.slicer_url ? (
          <Row
            lead={attachmentIcon}
            name={print.slicer_filename || "Prepared print"}
            meta={["Prepared print", preparedSummary(print.prepared_print)].filter(Boolean).join(" · ")}
            trailing={
              <DownloadLink
                href={printsApi.fileUrl(print.slicer_url)}
                filename={print.slicer_filename || "prepared"}
                busy={busyId === "prepared"}
                onDownload={() =>
                  extra.mutate({
                    id: "prepared",
                    url: print.slicer_url ?? "",
                    filename: print.slicer_filename || "prepared",
                  })
                }
              />
            }
          />
        ) : null}

        {supporting.map((file) => (
          <Row
            key={file.id}
            lead={attachmentIcon}
            name={file.filename}
            meta={`Supporting file · ${formatFileSize(file.size)}`}
            trailing={
              <DownloadLink
                href={printsApi.fileUrl(file.url)}
                filename={file.filename}
                busy={busyId === file.id}
                onDownload={() => extra.mutate(file)}
              />
            }
          />
        ))}
      </ul>
    </Card>
  );
}
