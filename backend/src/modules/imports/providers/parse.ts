import { z } from "zod";

/**
 * zod 4 treats a missing key as an error even for `unknown`, so every field schema below is optional-in:
 * an absent key is parsed as `undefined`, like any other junk value.
 */
export function lenient<T>(read: (value: unknown) => T) {
  return z.unknown().transform(read).prefault(undefined);
}

/** A raw field that is read later by hand. */
export const anyValue = z.unknown().optional();

// Response parsing at the provider boundary. Remote payloads drift, so every field schema here is total:
// a wrong type yields null / an empty list instead of a failed parse, exactly as the hand-written guards did.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Null for an empty or malformed body. */
export function parseJson(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** A non-blank string, trimmed; anything else is null. */
export const trimmedText = lenient((v) => (typeof v === "string" && v.trim() ? v.trim() : null));

/** A non-blank string, returned as received (for URLs that were never trimmed). */
export const rawText = lenient((v) => (typeof v === "string" && v.trim() ? v : null));

/** Ids arrive as numbers or strings. */
export const idText = lenient((v) => (v == null ? null : String(v)));

/** The parsed items of an array, or [] when the value isn't one. `item` must be total. */
export function listOf<S extends z.ZodType>(item: S) {
  return lenient((v): z.output<S>[] => (Array.isArray(v) ? v.map((entry) => item.parse(entry)) : []));
}

/** `schema` applied to a plain object, null for anything else. `schema` must be total over objects. */
export function objectOf<S extends z.ZodType>(schema: S) {
  return lenient((v): z.output<S> | null => (isRecord(v) ? schema.parse(v) : null));
}

/** `{ name, url }` pairs; entries missing either string are dropped. */
export const namedUrlList = lenient((v) =>
  Array.isArray(v)
    ? v
        .filter(
          (f): f is Record<string, unknown> => isRecord(f) && typeof f.name === "string" && typeof f.url === "string",
        )
        .map((f) => ({ name: f.name as string, url: f.url as string }))
    : [],
);
