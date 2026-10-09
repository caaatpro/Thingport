// Two plates of one print, showing that siblings share the {model} directory.
const PLATE_PREVIEW_VALUES: Record<string, string>[] = [
  {
    category: "Props/Workshop",
    collection: "Tabletop",
    tags: "Print in place + Useful",
    creator: "Example creator",
    model: "Cable clip",
    filename: "Cable clip.3mf",
    id: "a1b2c3d4",
    plate: "1",
  },
  {
    category: "Props/Workshop",
    collection: "Tabletop",
    tags: "Print in place + Useful",
    creator: "Example creator",
    model: "Cable clip",
    filename: "Cable clip-2.3mf",
    id: "a1b2c3d4",
    plate: "2",
  },
];

/** Inserts `{token}` before the trailing `/{filename}` (or at the end); a second `{filename}` is ignored. */
export function addToken(value: string, token: string): string {
  const text = `{${token}}`;
  if (token === "filename" && value.includes(text)) return value;
  const suffix = "/{filename}";
  if (value.endsWith(suffix)) return `${value.slice(0, -suffix.length)}/${text}${suffix}`;
  return `${value}${value.endsWith("/") || !value ? "" : "/"}${text}`;
}

export function renderExamples(template: string): string[] {
  const t = template.trim();
  if (!t) return [];
  return PLATE_PREVIEW_VALUES.map((values) =>
    Object.entries(values).reduce((acc, [token, replacement]) => acc.split(`{${token}}`).join(replacement), t),
  );
}

const UNITS = [
  { name: "month", seconds: 2629800 }, // a year / 12
  { name: "week", seconds: 604800 },
  { name: "day", seconds: 86400 },
  { name: "hour", seconds: 3600 },
  { name: "minute", seconds: 60 },
] as const;

/** e.g. 90000 -> "1 day". Null under a minute. */
export function describeDuration(totalSeconds: number): string | null {
  for (const unit of UNITS) {
    if (totalSeconds >= unit.seconds) {
      const value = Math.round((totalSeconds / unit.seconds) * 10) / 10;
      return `${value} ${unit.name}${value === 1 ? "" : "s"}`;
    }
  }
  return null;
}
