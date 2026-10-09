import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { STORAGE } from "../../config";
import { prisma } from "../../db";
import { getStorageTemplate, setStorageTemplate, validateStorageTemplate } from "./storage";

const app = createApp();
const stamp = Date.now();
let token: string;
// The database is shared across files, so restore the template afterwards.
let previousTemplate: string;

const auth = () => ({ Authorization: `Bearer ${token}` });

function tmpFile(name: string, contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "thingport-test-"));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}

async function upload(name: string): Promise<string> {
  const res = await request(app)
    .post("/api/upload")
    .set(auth())
    .attach("files", tmpFile(`${name}.stl`, `solid ${name} endsolid`));
  expect(res.status).toBe(200);
  return res.body.prints[0].id;
}

/** The plate's path below the user's own u-<id> folder, after checking the file really is there. */
async function platePath(printId: string): Promise<string> {
  const plate = await prisma.plate.findFirstOrThrow({ where: { printId } });
  expect(fs.existsSync(path.join(STORAGE, plate.storagePath))).toBe(true);
  return plate.storagePath.split(path.sep).slice(1).join("/");
}

async function createCollection(name: string): Promise<string> {
  const res = await request(app).post("/api/collections").set(auth()).send({ name });
  expect(res.status).toBe(200);
  return res.body.id;
}

beforeAll(async () => {
  previousTemplate = await getStorageTemplate();
  await setStorageTemplate("{collection}/{creator}/{model}/{filename}");
  const res = await request(app)
    .post("/api/register")
    .send({
      displayName: `Storage Tester ${stamp}`,
      email: `storage-template-${stamp}@example.com`,
      password: "password123",
    });
  token = res.body.token;
});

afterAll(async () => {
  await setStorageTemplate(previousTemplate);
});

describe("legacy tokens", () => {
  it("rewrites {name} to {model}", () => {
    expect(validateStorageTemplate("{creator}/{name}/{filename}")).toBe("{creator}/{model}/{filename}");
  });
});

describe("{collection} and {creator} folders", () => {
  it("follow a model's real collections as it's added, removed, and its collection renamed or deleted", async () => {
    const printId = await upload(`collection-moves-${stamp}`);
    const model = `collection-moves-${stamp}`;
    const author = `Storage Tester ${stamp}`;
    expect(await platePath(printId)).toBe(`Uncollected/${author}/${model}/${model}.stl`);

    const first = await createCollection(`First ${stamp}`);
    expect((await request(app).post(`/api/collection/${first}/items/${printId}`).set(auth())).status).toBe(200);
    expect(await platePath(printId)).toBe(`First ${stamp}/${author}/${model}/${model}.stl`);

    const second = await createCollection(`Second ${stamp}`);
    await request(app).post(`/api/collection/${second}/items/${printId}`).set(auth());
    expect(await platePath(printId)).toBe(`Multiple collections/${author}/${model}/${model}.stl`);

    await request(app).delete(`/api/collection/${second}/items/${printId}`).set(auth());
    expect(await platePath(printId)).toBe(`First ${stamp}/${author}/${model}/${model}.stl`);

    await request(app)
      .patch(`/api/collection/${first}`)
      .set(auth())
      .send({ name: `Renamed ${stamp}` });
    expect(await platePath(printId)).toBe(`Renamed ${stamp}/${author}/${model}/${model}.stl`);

    await request(app).delete(`/api/collection/${first}`).set(auth());
    expect(await platePath(printId)).toBe(`Uncollected/${author}/${model}/${model}.stl`);
  });

  it("uses an imported model's author, and the uploader's name once the author is reset", async () => {
    const printId = await upload(`author-reset-${stamp}`);
    const model = `author-reset-${stamp}`;
    const authorId = `makerworld:storage-${stamp}`;
    await prisma.author.create({
      data: { id: authorId, provider: "makerworld", externalId: `storage-${stamp}`, name: "Imported Maker" },
    });
    await prisma.print.update({
      where: { id: printId },
      data: { authorId, creator: "Imported Maker", sourceProvider: "makerworld" },
    });
    await request(app)
      .post(`/api/print/${printId}/tags`)
      .set(auth())
      .send({ tags: ["x"] }); // any edit re-renders the path
    expect(await platePath(printId)).toBe(`Uncollected/Imported Maker/${model}/${model}.stl`);

    expect((await request(app).post(`/api/print/${printId}/author-reset`).set(auth())).status).toBe(200);
    expect(await platePath(printId)).toBe(`Uncollected/Storage Tester ${stamp}/${model}/${model}.stl`);
  });
});
