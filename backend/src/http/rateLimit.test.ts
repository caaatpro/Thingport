import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { rateLimit } from "./rateLimit";

function appWith(max: number) {
  const app = express();
  app.post("/x", rateLimit({ windowMs: 60_000, max, enabled: true }), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("rateLimit", () => {
  it("lets requests through up to the limit, then answers 429 with Retry-After", async () => {
    const app = appWith(2);
    expect((await request(app).post("/x")).status).toBe(200);
    expect((await request(app).post("/x")).status).toBe(200);
    const blocked = await request(app).post("/x");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.body.error).toMatch(/too many/i);
  });

  it("is skipped under NODE_ENV=test unless enabled", async () => {
    const app = express();
    app.post("/x", rateLimit({ windowMs: 60_000, max: 1 }), (_req, res) => {
      res.json({ ok: true });
    });
    expect((await request(app).post("/x")).status).toBe(200);
    expect((await request(app).post("/x")).status).toBe(200);
  });
});
