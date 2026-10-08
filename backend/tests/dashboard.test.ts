import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createApp } from "../src/app";

const app = createApp();
let token: string;

const auth = () => ({ Authorization: `Bearer ${token}` });

function stl(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "thingport-dash-"));
  const file = path.join(dir, `${name}.stl`);
  fs.writeFileSync(
    file,
    `solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n`,
  );
  return file;
}

async function upload(name: string): Promise<string> {
  const res = await request(app).post("/api/upload").set(auth()).attach("files", stl(name));
  expect(res.status).toBe(200);
  return res.body.prints[0].id;
}

beforeAll(async () => {
  // On a fresh database the first account is the admin; the shelves must also work for a plain member.
  await request(app)
    .post("/api/register")
    .send({ displayName: "Filler", email: `dash-filler-${Date.now()}@example.com`, password: "password123" });
  const res = await request(app)
    .post("/api/register")
    .send({ displayName: "Dash Test", email: `dash-${Date.now()}@example.com`, password: "password123" });
  token = res.body.token;
});

describe("dashboard summary shelves", () => {
  it("starts with empty viewed and favorite shelves", async () => {
    const res = await request(app).get("/api/dashboard/summary").set(auth());
    expect({ status: res.status, body: res.status === 200 ? null : res.body }).toEqual({ status: 200, body: null });
    expect(res.body.recently_viewed).toEqual([]);
    expect(res.body.favorites).toEqual([]);
  });

  it("lists a model once it was opened, and once it was starred", async () => {
    const first = await upload("dash-first");
    const second = await upload("dash-second");
    await request(app).get(`/api/print/${first}`).set(auth());
    await request(app).get(`/api/print/${second}`).set(auth());
    await request(app).post(`/api/print/${first}/favorite`).set(auth());

    const res = await request(app).get("/api/dashboard/summary").set(auth());
    // Most recently opened first.
    expect(res.body.recently_viewed.map((m: { id: string }) => m.id)).toEqual([second, first]);
    expect(res.body.favorites.map((m: { id: string }) => m.id)).toEqual([first]);
    expect(res.body.recently_added.length).toBe(2);
  });
});
