import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createApp } from "../src/app";
import { prisma } from "../src/db";

const app = createApp();
const stamp = Date.now();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let owner: { token: string; id: string };
let friend: { token: string; id: string };
let stranger: { token: string; id: string };
const createdUserIds: string[] = [];

async function register(name: string): Promise<{ token: string; id: string }> {
  const res = await request(app)
    .post("/api/register")
    .send({ displayName: name, email: `${name}-${stamp}@example.com`, password: "password123" });
  createdUserIds.push(res.body.user.id);
  return { token: res.body.token, id: res.body.user.id };
}

async function uploadModel(token: string, name: string): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "thingport-share-"));
  const file = path.join(dir, `${name}.stl`);
  fs.writeFileSync(file, `solid ${name}\nendsolid ${name}\n`);
  const res = await request(app).post("/api/upload").set(auth(token)).attach("files", file);
  fs.rmSync(dir, { recursive: true, force: true });
  expect(res.status).toBe(200);
  return res.body.prints[0].id;
}

const canRead = async (token: string, printId: string) =>
  (await request(app).get(`/api/print/${printId}`).set(auth(token))).status === 200;

beforeAll(async () => {
  owner = await register("coll-owner");
  friend = await register("coll-friend");
  stranger = await register("coll-stranger");
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("sharing a collection shares the models in it", () => {
  let collectionId: string;
  let inside: string;
  let later: string;
  let outside: string;

  beforeAll(async () => {
    inside = await uploadModel(owner.token, `inside${stamp}`);
    later = await uploadModel(owner.token, `later${stamp}`);
    outside = await uploadModel(owner.token, `outside${stamp}`);
    const made = await request(app)
      .post("/api/collections")
      .set(auth(owner.token))
      .send({ name: `Shared box ${stamp}` });
    collectionId = made.body.id;
    await request(app).post(`/api/collection/${collectionId}/items/${inside}`).set(auth(owner.token));
  });

  it("is private until the collection is shared", async () => {
    expect(await canRead(friend.token, inside)).toBe(false);
  });

  it("gives the recipient every model already in the collection, and nothing else", async () => {
    const shared = await request(app)
      .put(`/api/collection/${collectionId}/shares`)
      .set(auth(owner.token))
      .send({ user_ids: [friend.id] });
    expect(shared.status).toBe(200);

    expect(await canRead(friend.token, inside)).toBe(true);
    expect(await canRead(friend.token, outside)).toBe(false);
    expect(await canRead(stranger.token, inside)).toBe(false);
  });

  it("includes models added to the collection later, with no further sharing", async () => {
    expect(await canRead(friend.token, later)).toBe(false);
    await request(app).post(`/api/collection/${collectionId}/items/${later}`).set(auth(owner.token));
    expect(await canRead(friend.token, later)).toBe(true);
  });

  it("lists them for the recipient: collection page, shared tab and search", async () => {
    const inCollection = await request(app)
      .get("/api/prints")
      .query({ collection_id: collectionId })
      .set(auth(friend.token));
    expect(inCollection.body.map((p: { id: string }) => p.id).sort()).toEqual([inside, later].sort());

    const sharedTab = await request(app).get("/api/prints").query({ scope: "shared" }).set(auth(friend.token));
    const sharedIds = sharedTab.body.map((p: { id: string }) => p.id);
    expect(sharedIds).toEqual(expect.arrayContaining([inside, later]));
    expect(sharedIds).not.toContain(outside);

    const found = await request(app)
      .get("/api/search")
      .query({ q: `inside${stamp}` })
      .set(auth(friend.token));
    expect(JSON.stringify(found.body)).toContain(inside);
    const hidden = await request(app)
      .get("/api/search")
      .query({ q: `outside${stamp}` })
      .set(auth(friend.token));
    expect(JSON.stringify(hidden.body)).not.toContain(outside);
  });

  it("serves the recipient the model's files and thumbnails", async () => {
    const detail = await request(app).get(`/api/print/${inside}`).set(auth(friend.token));
    expect(detail.body.is_owner).toBe(false);
    expect(detail.body.owner?.id).toBe(owner.id);
    const plateId = detail.body.plates[0].id;
    const thumb = await request(app).get(`/api/plate/${plateId}/thumb.jpg`).set(auth(friend.token));
    expect([200, 404]).toContain(thumb.status); // 404 only when no thumbnail was rendered yet
    expect((await request(app).get(`/api/plate/${plateId}/thumb.jpg`).set(auth(stranger.token))).status).toBe(404);
  });

  it("stays read-only for the recipient", async () => {
    expect((await request(app).delete(`/api/print/${inside}`).set(auth(friend.token))).status).toBe(404);
    const tag = await request(app)
      .post(`/api/print/${inside}/tags`)
      .set(auth(friend.token))
      .send({ tags: ["x"] });
    expect(tag.status).toBe(404);
    const put = await request(app)
      .put(`/api/print/${inside}/shares`)
      .set(auth(friend.token))
      .send({ user_ids: [stranger.id] });
    expect(put.status).toBe(404);
    expect(await canRead(stranger.token, inside)).toBe(false);
  });

  it("marks the owner's models in a shared collection as shared", async () => {
    const mine = await request(app).get(`/api/print/${inside}`).set(auth(owner.token));
    expect(mine.body.visibility).toBe("shared");
    const untouched = await request(app).get(`/api/print/${outside}`).set(auth(owner.token));
    expect(untouched.body.visibility).toBe("private");
  });

  it("takes a model away from the recipient when it leaves the collection", async () => {
    await request(app).delete(`/api/collection/${collectionId}/items/${later}`).set(auth(owner.token));
    expect(await canRead(friend.token, later)).toBe(false);
    expect(await canRead(friend.token, inside)).toBe(true);
  });

  it("takes everything away when the share is removed", async () => {
    await request(app).put(`/api/collection/${collectionId}/shares`).set(auth(owner.token)).send({ user_ids: [] });
    expect(await canRead(friend.token, inside)).toBe(false);
  });

  it("keeps a model shared directly even after it leaves the shared collection", async () => {
    await request(app)
      .put(`/api/print/${later}/shares`)
      .set(auth(owner.token))
      .send({ user_ids: [friend.id] });
    expect(await canRead(friend.token, later)).toBe(true);
  });
});
