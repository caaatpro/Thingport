/** Formats a prepared print's estimated duration as "1 d 2 h 3 min", or null when there is none. */
export function formatPreparedDuration(totalSeconds?: number | null): string | null {
  if (!totalSeconds || totalSeconds < 1) return null;
  const roundedMinutes = Math.max(1, Math.round(totalSeconds / 60));
  const days = Math.floor(roundedMinutes / 1440);
  const hours = Math.floor((roundedMinutes % 1440) / 60);
  const minutes = roundedMinutes % 60;
  return [days ? `${days} d` : "", hours ? `${hours} h` : "", minutes ? `${minutes} min` : ""]
    .filter(Boolean)
    .join(" ");
}
