import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import fs from "node:fs/promises";
import sharp from "sharp";
import { createApp } from "../../app";
import { prisma } from "../../db";
import { plateThumbPath } from "./plateThumbnails";

const app = createApp();
const stamp = Date.now();
let token: string;
let userId: string;

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const res = await request(app)
    .post("/api/register")
    .send({ displayName: "Thumb Test", email: `thumb-gen-${stamp}@example.com`, password: "password123" });
  token = res.body.token;
  userId = res.body.user.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: userId } });
});

async function uploadStl(name: string): Promise<{ printId: string; plateId: string }> {
  const stl =
    "solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid t\n";
  const res = await request(app).post("/api/upload").set(auth()).attach("files", Buffer.from(stl), `${name}.stl`);
  expect(res.status).toBe(200);
  return { printId: res.body.prints[0].id, plateId: res.body.prints[0].plates[0].id };
}

const blackPng = () =>
  sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .png()
    .toBuffer();

async function waitForThumb(plateId: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (
      await fs.access(plateThumbPath(plateId)).then(
        () => true,
        () => false,
      )
    )
      return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

describe("POST /plate/:id/thumbnail-generated", () => {
  it("keeps an existing thumbnail instead of replacing it with the browser's snapshot", async () => {
    const { plateId } = await uploadStl(`keep-${stamp}`);
    await waitForThumb(plateId);
    const before = await fs.readFile(plateThumbPath(plateId));

    const res = await request(app)
      .post(`/api/plate/${plateId}/thumbnail-generated`)
      .set(auth())
      .attach("file", await blackPng(), "thumbnail.png");
    expect(res.status).toBe(200);
    expect(res.body.print).toBeTruthy();
    expect((await fs.readFile(plateThumbPath(plateId))).equals(before)).toBe(true);
  });

  it("still accepts a snapshot when the plate has no thumbnail yet", async () => {
    const { plateId } = await uploadStl(`fill-${stamp}`);
    await waitForThumb(plateId);
    await fs.rm(plateThumbPath(plateId), { force: true });

    const res = await request(app)
      .post(`/api/plate/${plateId}/thumbnail-generated`)
      .set(auth())
      .attach("file", await blackPng(), "thumbnail.png");
    expect(res.status).toBe(200);
    await fs.access(plateThumbPath(plateId));
  });

  it("refuses someone else's plate", async () => {
    const { plateId } = await uploadStl(`other-${stamp}`);
    const other = await request(app)
      .post("/api/register")
      .send({ displayName: "Other", email: `thumb-other-${stamp}@example.com`, password: "password123" });
    const res = await request(app)
      .post(`/api/plate/${plateId}/thumbnail-generated`)
      .set({ Authorization: `Bearer ${other.body.token}` })
      .attach("file", await blackPng(), "thumbnail.png");
    expect(res.status).toBe(404);
    await prisma.user.delete({ where: { id: other.body.user.id } });
  });
});
