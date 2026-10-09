import type { z } from "zod";
import { badRequest } from "./errors";

/** Parses untrusted input, answering 400 with the schema's own messages when it doesn't fit. */
export function parse<S extends z.ZodType>(schema: S, data: unknown, fallback = "Invalid request"): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest(result.error.issues.map((i) => i.message).join("; ") || fallback);
  }
  return result.data;
}
