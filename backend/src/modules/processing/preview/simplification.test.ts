import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../../app";
import { prisma } from "../../../db";
import { writeZip } from "../../../lib/zipWriter";
import { modelPreviewGlbPath } from "./cachePaths";
import { renderModelPreviewGlb } from "./render";
import { dropPreviewsAffectedBySimplification } from "./simplification";
import { getSimplifyPreviews, setSimplifyPreviews } from "../../system/index";

const app = createApp();
const stamp = Date.now();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** 2(n-1)^2 triangles sharing vertices, like a real 3MF mesh. */
function gridMeshXml(n: number): string {
  const vertices: string[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++)
      vertices.push(`<vertex x="${i}" y="${j}" z="${(Math.sin(i / 10) * Math.cos(j / 10)).toFixed(4)}"/>`);
  }
  const triangles: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      triangles.push(
        `<triangle v1="${a}" v2="${a + 1}" v3="${a + n}"/>`,
        `<triangle v1="${a + 1}" v2="${a + n + 1}" v3="${a + n}"/>`,
      );
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter">
 <resources><object id="1" type="model"><mesh><vertices>${vertices.join("")}</vertices><triangles>${triangles.join("")}</triangles></mesh></object></resources>
 <build><item objectid="1" /></build>
</model>`;
}

function readGlbJson(file: string): any {
  const buf = fsSync.readFileSync(file);
  return JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf-8"));
}

function glbTriangles(gltf: any): number {
  let total = 0;
  for (const mesh of gltf.meshes)
    for (const primitive of mesh.primitives) total += gltf.accessors[primitive.indices].count / 3;
  return total;
}

describe("renderModelPreviewGlb with simplification", () => {
  let fixture: string;
  let outDir: string;

  beforeAll(async () => {
    outDir = await fs.mkdtemp(path.join(os.tmpdir(), "thingport-simplify-"));
    const modelPath = path.join(outDir, "3dmodel.model");
    await fs.writeFile(modelPath, gridMeshXml(101)); // 20,000 triangles
    fixture = path.join(outDir, "grid.3mf");
    await writeZip(fixture, [{ arcname: "3D/3dmodel.model", filePath: modelPath }]);
  });

  it("reduces a model over the budget to about the budget, and notes it in the preview", async () => {
    const dest = path.join(outDir, "simplified.glb");
    expect(await renderModelPreviewGlb(fixture, dest, { simplifyTo: 5_000 })).toBe("ok");
    const gltf = readGlbJson(dest);
    const triangles = glbTriangles(gltf);
    expect(triangles).toBeLessThanOrEqual(5_000);
    expect(triangles).toBeGreaterThan(2_000);
    const positions = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION].count;
    expect(positions).toBeLessThan((101 * 101) / 2);
    const meta = JSON.parse(gltf.nodes.find((n: any) => n.extras?.thingportPreview).extras.thingportPreview);
    expect(meta.simplified).toEqual({ from: 20_000, to: triangles });
  });

  it("leaves a model within the budget exactly as it is", async () => {
    const dest = path.join(outDir, "untouched.glb");
    await renderModelPreviewGlb(fixture, dest, { simplifyTo: 50_000 });
    const gltf = readGlbJson(dest);
    expect(glbTriangles(gltf)).toBe(20_000);
    const meta = JSON.parse(gltf.nodes.find((n: any) => n.extras?.thingportPreview).extras.thingportPreview);
    expect(meta.simplified).toBeUndefined();
  });
});

/** Holds only a JSON chunk, which is all the simplification check reads. */
async function writeFakeGlb(file: string, triangles: number, simplified: boolean): Promise<void> {
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: "2.0" },
      accessors: [{ count: triangles * 3 }],
      meshes: [{ primitives: [{ indices: 0 }] }],
      nodes: [
        {
          extras: {
            thingportPreview: JSON.stringify(simplified ? { simplified: { from: triangles * 2, to: triangles } } : {}),
          },
        },
      ],
    }),
  );
  const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + padded.length, 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  await fs.writeFile(file, Buffer.concat([header, padded]));
}

describe("dropPreviewsAffectedBySimplification", () => {
  const ids = {
    heavy: `test-fixture-simplify-heavy-${stamp}`,
    light: `test-fixture-simplify-light-${stamp}`,
    simplified: `test-fixture-simplify-done-${stamp}`,
  };

  beforeAll(async () => {
    await fs.mkdir(path.dirname(modelPreviewGlbPath("x")), { recursive: true });
  });

  afterAll(async () => {
    for (const id of Object.values(ids)) await fs.rm(modelPreviewGlbPath(id), { force: true });
  });

  async function writeAll() {
    await writeFakeGlb(modelPreviewGlbPath(ids.heavy), 3_000_000, false);
    await writeFakeGlb(modelPreviewGlbPath(ids.light), 200_000, false);
    await writeFakeGlb(modelPreviewGlbPath(ids.simplified), 1_000_000, true);
  }

  it("turned on: removes only unsimplified previews over the budget", async () => {
    await writeAll();
    await dropPreviewsAffectedBySimplification(true);
    expect(fsSync.existsSync(modelPreviewGlbPath(ids.heavy))).toBe(false);
    expect(fsSync.existsSync(modelPreviewGlbPath(ids.light))).toBe(true);
    expect(fsSync.existsSync(modelPreviewGlbPath(ids.simplified))).toBe(true);
  });

  it("turned off: removes only the simplified previews", async () => {
    await writeAll();
    await dropPreviewsAffectedBySimplification(false);
    expect(fsSync.existsSync(modelPreviewGlbPath(ids.heavy))).toBe(true);
    expect(fsSync.existsSync(modelPreviewGlbPath(ids.light))).toBe(true);
    expect(fsSync.existsSync(modelPreviewGlbPath(ids.simplified))).toBe(false);
  });
});

describe("/settings/rendering", () => {
  let adminToken: string;
  let memberToken: string;
  let previous: boolean;

  beforeAll(async () => {
    previous = await getSimplifyPreviews();
    const admin = await request(app)
      .post("/api/register")
      .send({ displayName: "Rendering Admin", email: `rendering-admin-${stamp}@example.com`, password: "password123" });
    await prisma.user.update({ where: { id: admin.body.user.id }, data: { role: "ADMIN" } });
    adminToken = (
      await request(app)
        .post("/api/login")
        .send({ email: `rendering-admin-${stamp}@example.com`, password: "password123" })
    ).body.token;
    const member = await request(app)
      .post("/api/register")
      .send({
        displayName: "Rendering Member",
        email: `rendering-member-${stamp}@example.com`,
        password: "password123",
      });
    memberToken = member.body.token;
  });

  afterAll(async () => {
    await setSimplifyPreviews(previous);
  });

  it("is off by default and admin-only", async () => {
    await prisma.setting.deleteMany({ where: { key: "simplify_previews" } });
    expect((await request(app).get("/api/settings/rendering").set(auth(memberToken))).status).toBe(403);
    const res = await request(app).get("/api/settings/rendering").set(auth(adminToken));
    expect(res.body).toEqual({ simplify_previews: false });
    expect(
      (await request(app).patch("/api/settings/rendering").set(auth(memberToken)).send({ simplify_previews: true }))
        .status,
    ).toBe(403);
  });

  it("saves the admin's choice", async () => {
    const res = await request(app)
      .patch("/api/settings/rendering")
      .set(auth(adminToken))
      .send({ simplify_previews: true });
    expect(res.body).toEqual({ simplify_previews: true });
    expect(await getSimplifyPreviews()).toBe(true);
  });
});
