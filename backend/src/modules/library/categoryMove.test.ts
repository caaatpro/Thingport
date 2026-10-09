import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app";

const app = createApp();
const stamp = Date.now();
let token: string;
let otherToken: string;

type CategoryOut = { id: string; name: string; parent_id: string | null; position: number };

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function create(name: string, parentId: string | null = null): Promise<string> {
  const res = await request(app).post("/api/categories").set(auth(token)).send({ name, parent_id: parentId });
  expect(res.status).toBe(200);
  return res.body.id;
}

const move = (id: string, parentId: string | null, position: number, as = token) =>
  request(app).post(`/api/category/${id}/move`).set(auth(as)).send({ parent_id: parentId, position });

/** Child names under `parentId`, in display order. */
async function childNames(parentId: string): Promise<string[]> {
  const res = await request(app).get("/api/categories").set(auth(token));
  return (res.body as CategoryOut[])
    .filter((c) => c.parent_id === parentId)
    .toSorted((a, b) => a.position - b.position)
    .map((c) => c.name);
}

beforeAll(async () => {
  token = (
    await request(app)
      .post("/api/register")
      .send({ displayName: "Mover", email: `mover-${stamp}@example.com`, password: "password123" })
  ).body.token;
  otherToken = (
    await request(app)
      .post("/api/register")
      .send({ displayName: "Other", email: `mover-other-${stamp}@example.com`, password: "password123" })
  ).body.token;
});

describe("POST /api/category/:id/move", () => {
  let rootA: string;
  let rootB: string;
  const subs: Record<string, string> = {};

  beforeEach(async () => {
    rootA = await create(`Root A ${Math.random()}`);
    rootB = await create(`Root B ${Math.random()}`);
    for (const name of ["a1", "a2", "a3"]) subs[name] = await create(name, rootA);
    for (const name of ["b1", "b2"]) subs[name] = await create(name, rootB);
    // Fresh categories all start at position 0; give them a definite order first.
    await request(app)
      .post("/api/categories/reorder")
      .set(auth(token))
      .send({ category_ids: [subs.a1, subs.a2, subs.a3] });
    await request(app)
      .post("/api/categories/reorder")
      .set(auth(token))
      .send({ category_ids: [subs.b1, subs.b2] });
  });

  it("reorders within the same category", async () => {
    expect((await move(subs.a3, rootA, 0)).status).toBe(200);
    expect(await childNames(rootA)).toEqual(["a3", "a1", "a2"]);
    expect((await move(subs.a3, rootA, 2)).status).toBe(200);
    expect(await childNames(rootA)).toEqual(["a1", "a2", "a3"]);
  });

  it("moves into another category at the given position, closing the gap behind", async () => {
    const res = await move(subs.a2, rootB, 1);
    expect(res.status).toBe(200);
    expect(res.body.parent_id).toBe(rootB);
    expect(await childNames(rootB)).toEqual(["b1", "a2", "b2"]);
    expect(await childNames(rootA)).toEqual(["a1", "a3"]);
  });

  it("appends when the position is past the end", async () => {
    expect((await move(subs.a1, rootB, 99)).status).toBe(200);
    expect(await childNames(rootB)).toEqual(["b1", "b2", "a1"]);
  });

  it("moves into an empty category", async () => {
    const empty = await create(`Empty ${Math.random()}`);
    expect((await move(subs.a1, empty, 0)).status).toBe(200);
    expect(await childNames(empty)).toEqual(["a1"]);
  });

  it("nests to any depth, whole subtrees included", async () => {
    expect((await move(subs.a1, subs.b1, 0)).status).toBe(200);
    expect((await move(subs.b1, subs.a2, 0)).status).toBe(200);
    expect(await childNames(subs.a2)).toEqual(["b1"]);
    expect(await childNames(subs.b1)).toEqual(["a1"]);
    // A category with subcategories can itself become one.
    expect((await move(rootB, rootA, 0)).status).toBe(200);
    expect((await childNames(rootA))[0]).toMatch(/^Root B/);
  });

  it("rejects cycles", async () => {
    expect((await move(subs.a1, subs.a1, 0)).status).toBe(400);
    // Under its own child, and under its own grandchild.
    expect((await move(rootA, subs.a1, 0)).status).toBe(400);
    const grandchild = await create("a1-child", subs.a1);
    expect((await move(rootA, grandchild, 0)).status).toBe(400);
  });

  it("moves subcategories up one level when their category is deleted", async () => {
    await create("a2-child-1", subs.a2);
    await create("a2-child-2", subs.a2);
    expect((await request(app).delete(`/api/category/${subs.a2}`).set(auth(token))).status).toBe(200);
    const names = await childNames(rootA);
    expect(names.slice(0, 2)).toEqual(["a1", "a3"]);
    expect(names.slice(2).toSorted()).toEqual(["a2-child-1", "a2-child-2"]);
  });

  it("only touches the user's own categories", async () => {
    expect((await move(subs.a1, rootB, 0, otherToken)).status).toBe(404);
    const otherRoot = (await request(app).post("/api/categories").set(auth(otherToken)).send({ name: "Other root" }))
      .body.id;
    expect((await move(subs.a1, otherRoot, 0)).status).toBe(400);
  });

  it("validates the body", async () => {
    expect((await move(subs.a1, rootB, -1)).status).toBe(400);
    expect(
      (await request(app).post(`/api/category/${subs.a1}/move`).set(auth(token)).send({ position: 0 })).status,
    ).toBe(400);
  });
});
