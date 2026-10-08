import type { z } from "zod";
import { HttpError } from "./fileUtils";

/** Parses a request body, answering 400 with the schema's own messages when it doesn't fit. */
export function parseBody<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, result.error.issues.map((i) => i.message).join("; ") || "Invalid request body");
  }
  return result.data;
}
