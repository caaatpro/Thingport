import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { UnauthorizedError } from "@/api/client";
import { printsApi, type Plate, type Print } from "@/api/prints";
import { useToast } from "@/ui";
import { saveResponseToDisk } from "@/utils/downloadResponse";
import { useInvalidatePrints } from "./queryKeys";

/** A single-plate model downloads directly; multi-plate opens a picker. `recordUse` bumps the print
 *  count (also used by Open in {Slicer}). */
export function useDownloadPrint(print: Print) {
  const toast = useToast();
  const invalidate = useInvalidatePrints();
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleDownloadError = (err: unknown) => {
    // A 401 is already handled centrally (session-expired toast).
    if (err instanceof UnauthorizedError) return;
    toast.error("Download failed. Try again.");
  };

  // Fire-and-forget. Only a real print counts: an older backend answers `{ ok: true }`.
  const record = useMutation({
    mutationFn: () => printsApi.recordDownload(print.id),
    onSuccess: (updated) => {
      if (updated && typeof updated === "object" && updated.id === print.id) void invalidate();
    },
  });
  const recordUse = () => record.mutate();

  const plateDownload = useMutation({
    mutationFn: async (plate: Plate) => {
      const res = await fetch(printsApi.fileUrl(plate.url));
      if (res.status === 401) throw new UnauthorizedError();
      if (!res.ok) throw new Error("Download failed");
      await saveResponseToDisk(res, plate.filename || "download");
    },
    onSuccess: () => {
      setPickerOpen(false);
      recordUse();
    },
    onError: handleDownloadError,
  });

  const zipDownload = useMutation({
    mutationFn: async () => {
      const res = await printsApi.downloadZip({ print_ids: [print.id] });
      await saveResponseToDisk(res, `${print.name || "model"}.zip`);
    },
    onSuccess: () => {
      setPickerOpen(false);
      recordUse();
    },
    onError: handleDownloadError,
  });

  const downloadPlate = (plate: Plate) => plateDownload.mutate(plate);
  const downloadAllZip = () => zipDownload.mutate();

  const handleDownload = () => {
    if (print.plates.length <= 1) {
      const plate = print.plates[0];
      if (plate) downloadPlate(plate);
      return;
    }
    setPickerOpen(true);
  };

  const sortedPlates = print.plates.toSorted((a, b) => a.position - b.position);

  return {
    pickerOpen,
    setPickerOpen,
    downloading: plateDownload.isPending || zipDownload.isPending,
    handleDownload,
    downloadPlate,
    downloadAllZip,
    sortedPlates,
    recordUse,
  };
}
