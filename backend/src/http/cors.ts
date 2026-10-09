export function resolveCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (raw) {
    return raw
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }
  // Only matters for local dev: in production nginx makes API calls same-origin.
  return ["http://localhost:5173"];
}
