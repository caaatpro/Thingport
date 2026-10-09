import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../db";

const app = createApp();
const stamp = Date.now();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const createdUserIds: string[] = [];

let admin: { token: string; id: string };

async function register(name: string, promote = false): Promise<{ token: string; id: string; email: string }> {
  const email = `${name}-${stamp}@example.com`;
  const res = await request(app).post("/api/register").send({ displayName: name, email, password: "password123" });
  const id: string = res.body.user.id;
  createdUserIds.push(id);
  if (promote) await prisma.user.update({ where: { id }, data: { role: "ADMIN" } });
  const login = await request(app).post("/api/login").send({ email, password: "password123" });
  return { token: login.body.token, id, email };
}

beforeAll(async () => {
  admin = await register("adm-admin", true);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("admin user management", () => {
  it("is admin-only", async () => {
    const member = await register("adm-plain");
    for (const [method, path] of [
      ["get", "/api/admin/users"],
      ["get", "/api/admin/overview"],
      ["post", "/api/admin/users"],
      ["patch", `/api/admin/users/${member.id}`],
      ["delete", `/api/admin/users/${member.id}`],
    ] as const) {
      const res = await request(app)[method](path).set(auth(member.token)).send({});
      expect({ call: `${method} ${path}`, status: res.status }).toEqual({ call: `${method} ${path}`, status: 403 });
    }
  });

  it("lists users with status, usage and last sign-in", async () => {
    const res = await request(app).get("/api/admin/users").set(auth(admin.token));
    expect(res.status).toBe(200);
    const me = res.body.find((u: { id: string }) => u.id === admin.id);
    expect(me).toMatchObject({ role: "ADMIN", disabled: false, print_count: 0, storage_bytes: 0 });
    expect(me.last_login_at).toBeTruthy();
    expect(me).not.toHaveProperty("password_hash");
  });

  it("creates a user with a generated password that works once", async () => {
    const email = `adm-created-${stamp}@example.com`;
    const res = await request(app)
      .post("/api/admin/users")
      .set(auth(admin.token))
      .send({ email, display_name: "Created", role: "MEMBER" });
    expect(res.status).toBe(201);
    createdUserIds.push(res.body.id);
    expect(res.body.generated_password).toMatch(/.{12,}/);
    const login = await request(app).post("/api/login").send({ email, password: res.body.generated_password });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe("MEMBER");

    const dup = await request(app)
      .post("/api/admin/users")
      .set(auth(admin.token))
      .send({ email: email.toUpperCase(), display_name: "Again" });
    expect(dup.status).toBe(409);
  });

  it("changes roles, and the new role applies to the user's existing session at once", async () => {
    const user = await register("adm-promote");
    expect((await request(app).get("/api/admin/users").set(auth(user.token))).status).toBe(403);
    const up = await request(app).patch(`/api/admin/users/${user.id}`).set(auth(admin.token)).send({ role: "ADMIN" });
    expect(up.status).toBe(200);
    expect((await request(app).get("/api/admin/users").set(auth(user.token))).status).toBe(200);
    await request(app).patch(`/api/admin/users/${user.id}`).set(auth(admin.token)).send({ role: "MEMBER" });
    expect((await request(app).get("/api/admin/users").set(auth(user.token))).status).toBe(403);
  });

  it("won't let an admin demote, disable or delete themselves", async () => {
    const demote = await request(app)
      .patch(`/api/admin/users/${admin.id}`)
      .set(auth(admin.token))
      .send({ role: "MEMBER" });
    expect(demote.status).toBe(400);
    const disable = await request(app)
      .patch(`/api/admin/users/${admin.id}`)
      .set(auth(admin.token))
      .send({ disabled: true });
    expect(disable.status).toBe(400);
    expect((await request(app).delete(`/api/admin/users/${admin.id}`).set(auth(admin.token))).status).toBe(400);
  });

  it("disabling stops sessions, sign-in and API tokens immediately; enabling restores sign-in", async () => {
    const user = await register("adm-disable");
    const minted = await request(app).post("/api/tokens").set(auth(user.token)).send({ name: "Grab" });
    const apiToken: string = minted.body.token;
    expect((await request(app).get("/api/collections").set(auth(user.token))).status).toBe(200);
    expect((await request(app).get("/api/collections").set(auth(apiToken))).status).toBe(200);

    const off = await request(app).patch(`/api/admin/users/${user.id}`).set(auth(admin.token)).send({ disabled: true });
    expect(off.status).toBe(200);
    expect((await request(app).get("/api/collections").set(auth(user.token))).status).toBe(401);
    expect((await request(app).get("/api/collections").set(auth(apiToken))).status).toBe(401);
    const blocked = await request(app).post("/api/login").send({ email: user.email, password: "password123" });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code ?? blocked.body.detail).toBeTruthy();

    await request(app).patch(`/api/admin/users/${user.id}`).set(auth(admin.token)).send({ disabled: false });
    const again = await request(app).post("/api/login").send({ email: user.email, password: "password123" });
    expect(again.status).toBe(200);
    expect((await request(app).get("/api/collections").set(auth(again.body.token))).status).toBe(200);
    // The pre-disable session stays dead.
    expect((await request(app).get("/api/collections").set(auth(user.token))).status).toBe(401);
  });

  it("signs a user out everywhere, optionally revoking API tokens", async () => {
    const user = await register("adm-signout");
    const minted = await request(app).post("/api/tokens").set(auth(user.token)).send({ name: "Grab" });
    const out = await request(app).post(`/api/admin/users/${user.id}/sign-out`).set(auth(admin.token)).send({});
    expect(out.status).toBe(200);
    expect(out.body.revoked_tokens).toBe(0);
    expect((await request(app).get("/api/collections").set(auth(user.token))).status).toBe(401);
    // The API token survives a plain sign-out ...
    expect((await request(app).get("/api/collections").set(auth(minted.body.token))).status).toBe(200);
    // ... and not one that revokes tokens.
    const revoke = await request(app)
      .post(`/api/admin/users/${user.id}/sign-out`)
      .set(auth(admin.token))
      .send({ revoke_tokens: true });
    expect(revoke.body.revoked_tokens).toBe(1);
    expect((await request(app).get("/api/collections").set(auth(minted.body.token))).status).toBe(401);
  });

  it("hands out a one-time password reset link that works", async () => {
    const user = await register("adm-reset");
    const res = await request(app).post(`/api/admin/users/${user.id}/reset-link`).set(auth(admin.token)).send({});
    expect(res.status).toBe(200);
    const token = new URL(res.body.url, "http://localhost").searchParams.get("token");
    expect(token).toBeTruthy();
    const reset = await request(app).post("/api/reset-password").send({ token, new_password: "a-new-password-1" });
    expect(reset.status).toBe(200);
    expect(
      (await request(app).post("/api/login").send({ email: user.email, password: "a-new-password-1" })).status,
    ).toBe(200);
    // Single use.
    expect(
      (await request(app).post("/api/reset-password").send({ token, new_password: "another-pass-2" })).status,
    ).toBe(400);
  });

  it("deletes a user together with their models", async () => {
    const user = await register("adm-delete");
    const up = await request(app)
      .post("/api/upload")
      .set(auth(user.token))
      .attach("files", Buffer.from("solid x\nendsolid x\n"), "gone.stl");
    expect(up.status).toBe(200);
    const printId = up.body.prints[0].id;

    const res = await request(app).delete(`/api/admin/users/${user.id}`).set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.deleted_models).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.print.findUnique({ where: { id: printId } })).toBeNull();
    expect((await request(app).get("/api/collections").set(auth(user.token))).status).toBe(401);
    expect((await request(app).delete(`/api/admin/users/${user.id}`).set(auth(admin.token))).status).toBe(404);
  });

  it("reports an overview of users, library and background work", async () => {
    const res = await request(app).get("/api/admin/overview").set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.users.total).toBeGreaterThanOrEqual(1);
    expect(res.body.users.admins).toBeGreaterThanOrEqual(1);
    expect(res.body.library).toEqual(
      expect.objectContaining({
        models: expect.any(Number),
        collections: expect.any(Number),
        model_bytes: expect.any(Number),
      }),
    );
    expect(res.body.processing).toEqual({
      queued: expect.any(Number),
      processing: expect.any(Number),
      failed: expect.any(Number),
    });
  });
});
