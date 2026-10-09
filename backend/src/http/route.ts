import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import type { z } from "zod";
import type { Role } from "../generated/prisma/client";
import { requireAdmin, requireAuth, requireSession } from "./auth";
import { parse } from "./validate";

/**
 * Who may call a route:
 *  - "public":  anyone (sign-in, health, shared links)
 *  - "user":    any signed-in user, including API tokens within their scope (the default)
 *  - "session": a real signed-in session; API tokens are refused (token management, credentials)
 *  - "admin":   an administrator's session or token
 */
export type Access = "public" | "user" | "session" | "admin";

type Identity<A extends Access> = A extends "public" ? { userId: string | undefined } : { userId: string; role: Role };

export type RouteContext<A extends Access, Q, B> = {
  req: Request;
  /** For streaming files or setting headers. When you use it to answer, return nothing. */
  res: Response;
  params: Record<string, string>;
  query: Q;
  body: B;
} & Identity<A>;

type Options<A extends Access, SQ extends z.ZodType | undefined, SB extends z.ZodType | undefined> = {
  access?: A;
  /** Validated and typed; a bad request is answered with 400 before the handler runs. */
  query?: SQ;
  body?: SB;
  /** Extra middleware that runs after authentication and before validation, e.g. multer for uploads. */
  use?: RequestHandler[];
};

type QueryOf<S> = S extends z.ZodType ? z.output<S> : Request["query"];
type BodyOf<S> = S extends z.ZodType ? z.output<S> : unknown;

type Method = "get" | "post" | "put" | "patch" | "delete";

/** Handlers return the JSON to send. Return nothing after answering through `ctx.res` yourself. */
type Handler<A extends Access, SQ, SB> = (ctx: RouteContext<A, QueryOf<SQ>, BodyOf<SB>>) => unknown;

function authChain(access: Access): RequestHandler[] {
  if (access === "public") return [];
  if (access === "session") return [requireAuth, requireSession];
  if (access === "admin") return [requireAuth, requireAdmin];
  return [requireAuth];
}

/**
 * A typed wrapper over an Express router. Each route states its access, optional query/body schemas and a
 * handler that receives a context and returns the response. It replaces the per-route boilerplate of
 * `asyncHandler`, `parseBody`, `req.userId!` and `res.json(...)`:
 *
 *   const api = createRouter();
 *   api.get("/things/:id", async ({ params, userId }) => things.get(userId, params.id));
 *   api.post("/things", { body: createThing }, async ({ body, userId }) => things.create(userId, body));
 *   api.delete("/admin/things/:id", { access: "admin" }, async ({ params }) => things.remove(params.id));
 */
export class ApiRouter {
  readonly router = Router();

  get<
    A extends Access = "user",
    SQ extends z.ZodType | undefined = undefined,
    SB extends z.ZodType | undefined = undefined,
  >(path: string, options: Options<A, SQ, SB> | Handler<A, SQ, SB>, handler?: Handler<A, SQ, SB>): this {
    return this.add("get", path, options, handler);
  }
  post<
    A extends Access = "user",
    SQ extends z.ZodType | undefined = undefined,
    SB extends z.ZodType | undefined = undefined,
  >(path: string, options: Options<A, SQ, SB> | Handler<A, SQ, SB>, handler?: Handler<A, SQ, SB>): this {
    return this.add("post", path, options, handler);
  }
  put<
    A extends Access = "user",
    SQ extends z.ZodType | undefined = undefined,
    SB extends z.ZodType | undefined = undefined,
  >(path: string, options: Options<A, SQ, SB> | Handler<A, SQ, SB>, handler?: Handler<A, SQ, SB>): this {
    return this.add("put", path, options, handler);
  }
  patch<
    A extends Access = "user",
    SQ extends z.ZodType | undefined = undefined,
    SB extends z.ZodType | undefined = undefined,
  >(path: string, options: Options<A, SQ, SB> | Handler<A, SQ, SB>, handler?: Handler<A, SQ, SB>): this {
    return this.add("patch", path, options, handler);
  }
  delete<
    A extends Access = "user",
    SQ extends z.ZodType | undefined = undefined,
    SB extends z.ZodType | undefined = undefined,
  >(path: string, options: Options<A, SQ, SB> | Handler<A, SQ, SB>, handler?: Handler<A, SQ, SB>): this {
    return this.add("delete", path, options, handler);
  }

  private add<A extends Access, SQ extends z.ZodType | undefined, SB extends z.ZodType | undefined>(
    method: Method,
    path: string,
    optionsOrHandler: Options<A, SQ, SB> | Handler<A, SQ, SB>,
    maybeHandler?: Handler<A, SQ, SB>,
  ): this {
    const options: Options<A, SQ, SB> = typeof optionsOrHandler === "function" ? {} : optionsOrHandler;
    const handler = typeof optionsOrHandler === "function" ? optionsOrHandler : maybeHandler;
    if (!handler) throw new Error(`Route ${method.toUpperCase()} ${path} has no handler`);
    const access = options.access ?? "user";

    const run = async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ctx = {
          req,
          res,
          params: req.params as Record<string, string>,
          query: options.query ? parse(options.query, req.query) : req.query,
          body: options.body ? parse(options.body, req.body) : req.body,
          userId: req.userId,
          role: req.userRole,
        } as RouteContext<A, QueryOf<SQ>, BodyOf<SB>>;
        const result = await handler(ctx);
        if (!res.headersSent && result !== undefined) res.json(result);
      } catch (err) {
        next(err);
      }
    };
    this.router[method](path, ...authChain(access), ...(options.use ?? []), run);
    return this;
  }
}

export function createRouter(): ApiRouter {
  return new ApiRouter();
}
