import type { PreparedPrint } from "@/api/prints";
import { formatPreparedDuration } from "@/utils/duration";

/** e.g. "Bambu Lab X1C · PLA · 0.2 mm layers · 1 h 5 min", or null when the file says nothing. */
export function preparedSummary(prepared: PreparedPrint | null | undefined): string | null {
  if (!prepared) return null;
  const parts = [
    prepared.printer,
    prepared.material,
    prepared.layer_height_mm ? `${prepared.layer_height_mm} mm layers` : null,
    prepared.nozzle_mm ? `${prepared.nozzle_mm} mm nozzle` : null,
    formatPreparedDuration(prepared.estimated_seconds),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
