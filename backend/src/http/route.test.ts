import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createRouter } from "./route";
import { errorHandler } from "./errorHandler";
import { notFound } from "./errors";

function appWith(build: (api: ReturnType<typeof createRouter>) => void) {
  const api = createRouter();
  build(api);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.body ??= {};
    next();
  });
  app.use(api.router);
  app.use(errorHandler);
  return app;
}

describe("createRouter", () => {
  it("sends the handler's return value as JSON", async () => {
    const app = appWith((api) => api.get("/ping", { access: "public" }, () => ({ pong: true })));
    const res = await request(app).get("/ping");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pong: true });
  });

  it("accepts the handler as the second argument (default access is a signed-in user)", async () => {
    const app = appWith((api) => api.get("/me", () => ({ ok: true })));
    expect((await request(app).get("/me")).status).toBe(401);
  });

  it("refuses unauthenticated calls to user, session and admin routes before running the handler", async () => {
    let ran = false;
    const app = appWith((api) => {
      api.get("/u", { access: "user" }, () => (ran = true));
      api.get("/s", { access: "session" }, () => (ran = true));
      api.get("/a", { access: "admin" }, () => (ran = true));
    });
    for (const path of ["/u", "/s", "/a"]) expect((await request(app).get(path)).status).toBe(401);
    expect(ran).toBe(false);
  });

  it("validates the body and query, answering 400 with the schema's messages", async () => {
    const app = appWith((api) => {
      api.post(
        "/things",
        { access: "public", body: z.object({ name: z.string().min(1, "Name is required") }) },
        ({ body }) => ({ name: body.name }),
      );
      api.get(
        "/list",
        { access: "public", query: z.object({ limit: z.coerce.number().int().min(1) }) },
        ({ query }) => ({
          limit: query.limit,
        }),
      );
    });
    const bad = await request(app).post("/things").send({ name: "" });
    expect(bad.status).toBe(400);
    expect(bad.body.detail).toBe("Name is required");
    expect((await request(app).post("/things").send({ name: "Box" })).body).toEqual({ name: "Box" });
    expect((await request(app).get("/list?limit=3")).body).toEqual({ limit: 3 });
    expect((await request(app).get("/list?limit=0")).status).toBe(400);
  });

  it("gives schemas an empty object when a request has no body", async () => {
    const app = appWith((api) =>
      api.post(
        "/empty",
        { access: "public", body: z.object({ tags: z.array(z.string()).default([]) }) },
        ({ body }) => body,
      ),
    );
    expect((await request(app).post("/empty")).body).toEqual({ tags: [] });
  });

  it("turns thrown HttpErrors into { detail, code } and unknown errors into 500", async () => {
    const app = appWith((api) => {
      api.get("/missing", { access: "public" }, () => {
        throw notFound("No such thing");
      });
      api.get("/boom", { access: "public" }, () => {
        throw new Error("secret detail");
      });
    });
    const missing = await request(app).get("/missing");
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ detail: "No such thing" });
    const boom = await request(app).get("/boom");
    expect(boom.status).toBe(500);
    expect(boom.body).toEqual({ detail: "Internal server error" });
  });

  it("lets a handler answer through res and return nothing", async () => {
    const app = appWith((api) =>
      api.get("/raw", { access: "public" }, ({ res }) => {
        res.type("text/plain").send("hello");
      }),
    );
    const res = await request(app).get("/raw");
    expect(res.text).toBe("hello");
  });
});
