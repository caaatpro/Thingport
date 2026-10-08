import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { hashApiToken, isRequestAllowedForScope, MAX_TOKENS_PER_USER } from "../src/services/apiTokenService";
import { isMakerworldHost } from "../src/utils/urlUtils";

const app = createApp();
const stamp = Date.now();
const email = (name: string) => `${name}-${stamp}@example.com`;
const session = (token: string) => ({ Authorization: `Bearer ${token}` });

let ownerSession: string;
let otherSession: string;
const createdUserIds: string[] = [];

async function register(name: string): Promise<{ token: string; id: string }> {
  const res = await request(app)
    .post("/api/register")
    .send({ displayName: name, email: email(name), password: "password123" });
  createdUserIds.push(res.body.user.id);
  return { token: res.body.token, id: res.body.user.id };
}

async function createToken(sessionToken: string, body: Record<string, unknown> = { name: "Grab" }) {
  return request(app).post("/api/tokens").set(session(sessionToken)).send(body);
}

beforeAll(async () => {
  ownerSession = (await register("token-owner")).token;
  otherSession = (await register("token-other")).token;
});

afterAll(async () => {
  await prisma.collection.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("creating and listing tokens", () => {
  it("returns the secret once and stores only its hash", async () => {
    const res = await createToken(ownerSession, { name: "My browser" });
    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^tpg_[A-Za-z0-9_-]{43}$/);
    expect(res.body.prefix).toBe(res.body.token.slice(0, 8));
    expect(res.body.scope).toBe("grab");

    const row = await prisma.apiToken.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.tokenHash).toBe(hashApiToken(res.body.token));
    expect(JSON.stringify(row)).not.toContain(res.body.token);

    const list = await request(app).get("/api/tokens").set(session(ownerSession));
    expect(list.status).toBe(200);
    const listed = list.body.find((t: { id: string }) => t.id === res.body.id);
    expect(listed.name).toBe("My browser");
    // The list never exposes the secret or its hash.
    expect(JSON.stringify(list.body)).not.toContain(res.body.token);
    expect(JSON.stringify(list.body)).not.toContain(row.tokenHash);
  });

  it("only lists the caller's own tokens", async () => {
    const mine = await createToken(ownerSession, { name: "owner-only" });
    const others = await request(app).get("/api/tokens").set(session(otherSession));
    expect(others.body.map((t: { id: string }) => t.id)).not.toContain(mine.body.id);
  });

  it("validates the name, scope and expiry", async () => {
    expect((await createToken(ownerSession, { name: "  " })).status).toBe(400);
    expect((await createToken(ownerSession, { name: "x", scope: "admin" })).status).toBe(400);
    expect((await createToken(ownerSession, { name: "x", expires_in_days: 0 })).status).toBe(400);
    const withExpiry = await createToken(ownerSession, { name: "short-lived", expires_in_days: 7 });
    expect(withExpiry.status).toBe(201);
    const days = (new Date(withExpiry.body.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("caps how many tokens a user can hold", async () => {
    const { token } = await register("token-capped");
    for (let i = 0; i < MAX_TOKENS_PER_USER; i++) {
      expect((await createToken(token, { name: `t${i}` })).status).toBe(201);
    }
    expect((await createToken(token, { name: "one too many" })).status).toBe(400);
  });
});

describe("authenticating with a token", () => {
  it("acts as its owner on the endpoints its scope allows", async () => {
    const created = await createToken(ownerSession, { name: "works" });
    const bearer = { Authorization: `Bearer ${created.body.token}` };

    const self = await request(app).get("/api/token/self").set(bearer);
    expect(self.status).toBe(200);
    expect(self.body.name).toBe("works");
    expect(self.body.user.email).toBe(email("token-owner"));

    // Creates a collection as the token's owner.
    const made = await request(app)
      .post("/api/collections")
      .set(bearer)
      .send({ name: `From grab ${stamp}` });
    expect(made.status).toBe(200);
    const mine = await request(app).get("/api/collections").set(session(ownerSession));
    expect(mine.body.map((c: { id: string }) => c.id)).toContain(made.body.id);
    const theirs = await request(app).get("/api/collections").set(session(otherSession));
    expect(theirs.body.map((c: { id: string }) => c.id)).not.toContain(made.body.id);
  });

  it("is refused everywhere its scope doesn't list (default-deny)", async () => {
    const created = await createToken(ownerSession, { name: "narrow" });
    const bearer = { Authorization: `Bearer ${created.body.token}` };
    for (const [method, path] of [
      ["get", "/api/prints"],
      ["get", "/api/users"],
      ["get", "/api/admin/users"],
      ["delete", "/api/print/abc"],
      ["post", "/api/print/abc/meta"],
      ["put", "/api/print/abc/shares"],
      ["get", "/api/tokens"],
    ] as const) {
      const res = await request(app)[method](path).set(bearer);
      expect({ call: `${method} ${path}`, status: res.status }).toEqual({ call: `${method} ${path}`, status: 403 });
    }
  });

  it("can't create, list or revoke tokens", async () => {
    const created = await createToken(ownerSession, { name: "no-escalation" });
    const bearer = { Authorization: `Bearer ${created.body.token}` };
    expect((await request(app).post("/api/tokens").set(bearer).send({ name: "child" })).status).toBe(403);
    expect((await request(app).delete(`/api/tokens/${created.body.id}`).set(bearer)).status).toBe(403);
  });

  it("is never accepted in a query string", async () => {
    const created = await createToken(ownerSession, { name: "header-only" });
    const res = await request(app).get("/api/collections").query({ token: created.body.token });
    expect(res.status).toBe(401);
  });

  it("rejects unknown, malformed and truncated tokens", async () => {
    const created = await createToken(ownerSession, { name: "real" });
    for (const bad of ["tpg_notarealtoken", "tpg_", created.body.token.slice(0, -1), `tpg_${"a".repeat(500)}`]) {
      const res = await request(app)
        .get("/api/collections")
        .set({ Authorization: `Bearer ${bad}` });
      expect({ token: bad.slice(0, 20), status: res.status }).toEqual({ token: bad.slice(0, 20), status: 401 });
    }
  });

  it("stops working once expired", async () => {
    const created = await createToken(ownerSession, { name: "expiring", expires_in_days: 1 });
    const bearer = { Authorization: `Bearer ${created.body.token}` };
    expect((await request(app).get("/api/collections").set(bearer)).status).toBe(200);
    await prisma.apiToken.update({ where: { id: created.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).get("/api/collections").set(bearer)).status).toBe(401);
  });

  it("records when it was last used", async () => {
    const created = await createToken(ownerSession, { name: "tracked" });
    expect((await prisma.apiToken.findUniqueOrThrow({ where: { id: created.body.id } })).lastUsedAt).toBeNull();
    await request(app)
      .get("/api/collections")
      .set({ Authorization: `Bearer ${created.body.token}` });
    await new Promise((resolve) => setTimeout(resolve, 100)); // the stamp is written in the background
    expect((await prisma.apiToken.findUniqueOrThrow({ where: { id: created.body.id } })).lastUsedAt).not.toBeNull();
  });
});

describe("revoking tokens", () => {
  it("takes effect immediately", async () => {
    const created = await createToken(ownerSession, { name: "to revoke" });
    const bearer = { Authorization: `Bearer ${created.body.token}` };
    expect((await request(app).get("/api/collections").set(bearer)).status).toBe(200);

    expect((await request(app).delete(`/api/tokens/${created.body.id}`).set(session(ownerSession))).status).toBe(200);
    expect((await request(app).get("/api/collections").set(bearer)).status).toBe(401);
    expect(await prisma.apiToken.findUnique({ where: { id: created.body.id } })).toBeNull();
  });

  it("can't revoke someone else's token", async () => {
    const created = await createToken(ownerSession, { name: "not yours" });
    expect((await request(app).delete(`/api/tokens/${created.body.id}`).set(session(otherSession))).status).toBe(404);
    expect(await prisma.apiToken.findUnique({ where: { id: created.body.id } })).not.toBeNull();
  });

  it("dies with its account", async () => {
    const { token, id } = await register("token-doomed");
    const created = await createToken(token, { name: "orphan" });
    await prisma.user.delete({ where: { id } });
    createdUserIds.splice(createdUserIds.indexOf(id), 1);
    const res = await request(app)
      .get("/api/collections")
      .set({ Authorization: `Bearer ${created.body.token}` });
    expect(res.status).toBe(401);
  });
});

const allowed = (method: string, path: string) => isRequestAllowedForScope("grab", method, path);

describe("the grab scope's allow-list", () => {
  it("allows what the extension uses", () => {
    expect(allowed("GET", "/collections")).toBe(true);
    expect(allowed("POST", "/collections")).toBe(true);
    expect(allowed("POST", "/collection/abc/items/def")).toBe(true);
    expect(allowed("POST", "/import")).toBe(true);
    expect(allowed("POST", "/import/zip/entries")).toBe(true);
    expect(allowed("GET", "/import/status")).toBe(true);
    expect(allowed("GET", "/import/jobs/xyz")).toBe(true);
    expect(allowed("PATCH", "/settings/makerworld")).toBe(true);
    expect(allowed("GET", "/plate/abc/thumb.jpg")).toBe(true);
  });

  it("refuses other methods on allowed paths and tricks that try to reach other routes", () => {
    expect(allowed("DELETE", "/collection/abc/items/def")).toBe(false);
    expect(allowed("DELETE", "/collections")).toBe(false);
    expect(allowed("PUT", "/settings/makerworld")).toBe(false);
    expect(allowed("GET", "/collections/")).toBe(false);
    expect(allowed("GET", "/Collections")).toBe(false);
    expect(allowed("GET", "/collections/../prints")).toBe(false);
    expect(allowed("GET", "/import/../prints")).toBe(false);
    expect(allowed("GET", "/import/jobs/a/b")).toBe(false);
    expect(allowed("POST", "/collection/a/b/items/c")).toBe(false);
    expect(allowed("POST", "/import/collection")).toBe(false);
    expect(allowed("GET", "")).toBe(false);
  });

  it("denies an unknown scope", () => {
    expect(isRequestAllowedForScope("full", "GET", "/collections")).toBe(false);
  });
});

describe("MakerWorld host matching", () => {
  it("matches the real site and its subdomains only", () => {
    expect(isMakerworldHost("makerworld.com")).toBe(true);
    expect(isMakerworldHost("www.makerworld.com")).toBe(true);
    expect(isMakerworldHost("MakerWorld.com")).toBe(true);
  });

  it("rejects lookalikes that would be sent the stored MakerWorld cookie", () => {
    expect(isMakerworldHost("evilmakerworld.com")).toBe(false);
    expect(isMakerworldHost("notmakerworld.com")).toBe(false);
    expect(isMakerworldHost("makerworld.com.evil.example")).toBe(false);
    expect(isMakerworldHost("")).toBe(false);
  });
});
