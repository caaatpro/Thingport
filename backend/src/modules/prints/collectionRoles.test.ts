import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createApp } from "../../app";
import { prisma } from "../../db";

const app = createApp();
const stamp = Date.now();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

type Account = { token: string; id: string };
let owner: Account;
let viewer: Account;
let uploader: Account;
let editor: Account;
let deleter: Account;
let outsider: Account;
const createdUserIds: string[] = [];
let collectionId: string;
let modelId: string;

async function register(name: string): Promise<Account> {
  const res = await request(app)
    .post("/api/register")
    .send({ displayName: name, email: `${name}-${stamp}@example.com`, password: "password123" });
  createdUserIds.push(res.body.user.id);
  return { token: res.body.token, id: res.body.user.id };
}

function stlFile(name: string): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "thingport-roles-"));
  const file = path.join(dir, `${name}.stl`);
  fs.writeFileSync(file, `solid ${name}\nendsolid ${name}\n`);
  return { dir, file };
}

async function upload(token: string, name: string, collection?: string) {
  const { dir, file } = stlFile(name);
  const req = request(app).post("/api/upload").set(auth(token)).attach("files", file);
  if (collection) req.field("collection_id", collection);
  const res = await req;
  fs.rmSync(dir, { recursive: true, force: true });
  return res;
}

beforeAll(async () => {
  // A throwaway first account takes the admin slot on a fresh database.
  await register("roles-filler");
  owner = await register("roles-owner");
  viewer = await register("roles-viewer");
  uploader = await register("roles-uploader");
  editor = await register("roles-editor");
  deleter = await register("roles-deleter");
  outsider = await register("roles-outsider");

  collectionId = (
    await request(app)
      .post("/api/collections")
      .set(auth(owner.token))
      .send({ name: `Roles box ${stamp}` })
  ).body.id;
  modelId = (await upload(owner.token, `roles-first-${stamp}`)).body.prints[0].id;
  await request(app).post(`/api/collection/${collectionId}/items/${modelId}`).set(auth(owner.token));
  const shared = await request(app)
    .put(`/api/collection/${collectionId}/shares`)
    .set(auth(owner.token))
    .send({
      shares: [
        { user_id: viewer.id, role: "view" },
        { user_id: uploader.id, role: "upload" },
        { user_id: editor.id, role: "edit" },
        { user_id: deleter.id, role: "delete" },
      ],
    });
  if (shared.status !== 200) throw new Error(`share setup failed: ${shared.status}`);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

const rename = (token: string, title: string) =>
  request(app).post(`/api/print/${modelId}/meta`).set(auth(token)).send({ title });

describe("collection share roles", () => {
  it("reports each person's role back to the owner", async () => {
    const res = await request(app).get(`/api/collection/${collectionId}/shares`).set(auth(owner.token));
    const roles = Object.fromEntries(res.body.map((s: { user_id: string; role: string }) => [s.user_id, s.role]));
    expect(roles).toEqual({
      [viewer.id]: "view",
      [uploader.id]: "upload",
      [editor.id]: "edit",
      [deleter.id]: "delete",
    });
  });

  it("tells a recipient their role on the collection and on its models", async () => {
    const coll = await request(app).get(`/api/collection/${collectionId}`).set(auth(uploader.token));
    expect(coll.body.my_role).toBe("upload");
    const model = await request(app).get(`/api/print/${modelId}`).set(auth(editor.token));
    expect(model.body.access_role).toBe("edit");
    const own = await request(app).get(`/api/print/${modelId}`).set(auth(owner.token));
    expect(own.body.access_role).toBe("owner");
  });

  it("lets only upload and above add models, which then belong to the owner", async () => {
    const asViewer = await upload(viewer.token, `v-${stamp}`, collectionId);
    expect(asViewer.status).toBe(403);
    const asOutsider = await upload(outsider.token, `o-${stamp}`, collectionId);
    expect(asOutsider.status).toBe(404);

    const asUploader = await upload(uploader.token, `u-${stamp}`, collectionId);
    expect(asUploader.status).toBe(200);
    const added = asUploader.body.prints[0].id;
    const row = await prisma.print.findUniqueOrThrow({ where: { id: added } });
    expect(row.userId).toBe(owner.id);
    const inCollection = await prisma.collectionItem.count({ where: { collectionId, printId: added } });
    expect(inCollection).toBe(1);
    // The owner sees it among their own models.
    expect((await request(app).get(`/api/print/${added}`).set(auth(owner.token))).status).toBe(200);
  });

  it("lets only edit and above change a model's details", async () => {
    expect((await rename(viewer.token, "nope")).status).toBe(404);
    expect((await rename(uploader.token, "nope")).status).toBe(404);
    const ok = await rename(editor.token, `Edited by editor ${stamp}`);
    expect(ok.status).toBe(200);
    expect(ok.body.print.title).toContain("Edited by editor");
    expect((await rename(outsider.token, "nope")).status).toBe(404);
  });

  it("lets only edit and above rename the collection or take a model out of it", async () => {
    const patch = (token: string) =>
      request(app)
        .patch(`/api/collection/${collectionId}`)
        .set(auth(token))
        .send({ name: `Roles box ${stamp}` });
    expect((await patch(viewer.token)).status).toBe(403);
    expect((await patch(uploader.token)).status).toBe(403);
    expect((await patch(editor.token)).status).toBe(200);

    const extra = (await upload(owner.token, `roles-extra-${stamp}`)).body.prints[0].id;
    await request(app).post(`/api/collection/${collectionId}/items/${extra}`).set(auth(owner.token));
    const remove = (token: string) =>
      request(app).delete(`/api/collection/${collectionId}/items/${extra}`).set(auth(token));
    expect((await remove(viewer.token)).status).toBe(403);
    expect((await remove(editor.token)).status).toBe(200);
  });

  it("lets only the delete role remove a model, and never the collection or its sharing", async () => {
    const victim = (await upload(owner.token, `roles-victim-${stamp}`)).body.prints[0].id;
    await request(app).post(`/api/collection/${collectionId}/items/${victim}`).set(auth(owner.token));
    const del = (token: string) => request(app).delete(`/api/print/${victim}`).set(auth(token));
    expect((await del(viewer.token)).status).toBe(403);
    expect((await del(editor.token)).status).toBe(403);
    expect((await del(deleter.token)).status).toBe(200);
    expect(await prisma.print.count({ where: { id: victim } })).toBe(0);

    const dropCollection = await request(app).delete(`/api/collection/${collectionId}`).set(auth(deleter.token));
    expect(dropCollection.status).toBe(404);
    const reshare = await request(app)
      .put(`/api/collection/${collectionId}/shares`)
      .set(auth(deleter.token))
      .send({ shares: [{ user_id: outsider.id, role: "delete" }] });
    expect(reshare.status).toBe(404);
  });

  it("keeps the old user_ids form working as read-only shares", async () => {
    const res = await request(app)
      .put(`/api/collection/${collectionId}/shares`)
      .set(auth(owner.token))
      .send({ user_ids: [viewer.id] });
    expect(res.status).toBe(200);
    const list = await request(app).get(`/api/collection/${collectionId}/shares`).set(auth(owner.token));
    expect(list.body).toHaveLength(1);
    expect(list.body[0].role).toBe("view");
    expect((await rename(editor.token, "after being removed")).status).toBe(404);
  });
});
