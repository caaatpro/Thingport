// Elegoo Slicer and Snapmaker Orca launch directly like OrcaSlicer, but name the file after the
// URL's last segment, so each gets the filename the way its handler reads it.
function withFilenameHint(slicerId: string, fileUrl: string, filename: string): { fileUrl: string; extra: string } {
  if (slicerId === "elegooslicer") {
    const url = new URL(fileUrl, window.location.origin);
    url.searchParams.set("filename", filename);
    return { fileUrl: url.toString(), extra: "" };
  }
  if (slicerId === "snapmaker-orca") {
    return { fileUrl, extra: `&name=${encodeURIComponent(filename)}` };
  }
  return { fileUrl, extra: "" };
}

// Only for SLICER_OPTIONS ids that register a protocol; never "other".
export function slicerLaunchUrl(slicerId: string, fileUrl: string, filename?: string): string {
  const hinted = filename ? withFilenameHint(slicerId, fileUrl, filename) : { fileUrl, extra: "" };
  return `${slicerId}://open?file=${encodeURIComponent(hinted.fileUrl)}${hinted.extra}`;
}
