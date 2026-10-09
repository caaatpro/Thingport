export type SlicerOption = { id: string; label: string };

// Slicers that register a URL protocol. IDs must match the backend's SLICER_IDS and (except
// "other") equal the scheme the slicer registers, e.g. "crealityprintlink".
export const SLICER_OPTIONS: SlicerOption[] = [
  { id: "bambustudio", label: "Bambu Studio" },
  { id: "orcaslicer", label: "OrcaSlicer" },
  { id: "prusaslicer", label: "PrusaSlicer" },
  { id: "cura", label: "Cura" },
  { id: "crealityprintlink", label: "Creality Print" },
  { id: "anycubicslicernext", label: "Anycubic Slicer Next" },
  { id: "elegooslicer", label: "Elegoo Slicer" },
  { id: "snapmaker-orca", label: "Snapmaker Orca" },
  { id: "other", label: "Other / Manual" },
];

// Offered "Open normalized in <slicer>" for MakerWorld 3MFs. They mis-import Bambu projects (lost colors,
// settings or parts); Orca forks too, since each copied Bambu's 3MF handling at a different point.
export const NORMALIZE_3MF_SLICER_IDS: ReadonlySet<string> = new Set([
  "prusaslicer",
  "cura",
  "anycubicslicernext",
  "crealityprintlink",
  "elegooslicer",
  "snapmaker-orca",
]);

/** "system" follows prefers-color-scheme; resolve with useResolvedTheme before rendering. */
export type ThemeSelection = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type ThemeOption = { id: ThemeSelection; label: string; description: string };

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "light", label: "Light", description: "Bright backgrounds, dark text." },
  { id: "dark", label: "Dark", description: "Dimmed panels for low light." },
  { id: "system", label: "Adapt to system", description: "Follows your device's light/dark setting." },
];
