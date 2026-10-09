import type { Print } from "@/api/prints";
import { formatFileSize } from "@/utils/fileSize";

/** The derived facts a card or row shows under the title. */
export function printMeta(print: Print) {
  const exts = [
    ...new Set(print.plates.map((p) => p.filename.split(".").pop()?.toUpperCase() ?? "").filter((e) => e && e.length <= 5)),
  ];
  const d = print.plates[0]?.dim_mm;
  const dims = d ? `${Math.round(d.x)}×${Math.round(d.y)}×${Math.round(d.z)} mm` : null;
  const size = typeof print.total_size === "number" && print.total_size > 0 ? formatFileSize(print.total_size) : null;
  return {
    title: print.title || print.name,
    exts: exts.join(", "),
    size,
    dims,
    fileCount: print.plates.length + (print.supporting_file_count || 0),
    created: print.created_at ? new Date(print.created_at).toLocaleDateString() : null,
    processing: print.plates.some((p) => p.processing_status === "queued" || p.processing_status === "processing"),
    failed: print.plates.some((p) => p.processing_status === "failed"),
    shared: print.visibility === "shared" || print.is_owner === false,
  };
}
