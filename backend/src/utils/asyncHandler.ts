import type { NextFunction, Request, RequestHandler, Response } from "express";

/** A route handler whose path parameters are plain strings. Express 5's types allow `string[]`
 *  for wildcard parameters, which none of our routes use. */
type RouteRequest = Request<Record<string, string>>;

/**
 * Wraps an async route handler. Express 5 forwards rejected promises to the error middleware on
 * its own, but the wrapper stays: it also gives handlers string-typed `req.params`.
 */
export function asyncHandler(
  fn: (req: RouteRequest, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as RouteRequest, res, next)).catch(next);
  };
}
