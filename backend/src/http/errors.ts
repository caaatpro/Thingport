/**
 * An error that carries the HTTP status to answer with. Throw it from services or handlers;
 * the error middleware turns it into `{ detail, code? }`.
 */
export class HttpError extends Error {
  status: number;
  /** For the rare case the frontend must branch on why a request failed, e.g. EMAIL_NOT_VERIFIED. */
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string, code?: string) => new HttpError(400, message, code);
export const unauthorized = (message = "Unauthorized") => new HttpError(401, message);
export const forbidden = (message = "You don't have permission to do that", code?: string) =>
  new HttpError(403, message, code);
export const notFound = (message = "Not found") => new HttpError(404, message);
export const conflict = (message: string, code?: string) => new HttpError(409, message, code);
export const payloadTooLarge = (message = "File is too large.") => new HttpError(413, message);
