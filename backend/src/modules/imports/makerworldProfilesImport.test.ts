import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

// No pacing or DNS here. config.ts reads the pace on load, so it's hoisted.
vi.hoisted(() => {
  process.env.IMPORT_MAKERWORLD_CALL_DELAY_MS = "0";
});
vi.mock("node:dns/promises", () => ({
  default: {
    resolve4: async () => ["93.184.216.34"],
    resolve6: async () => {
      throw new Error("no AAAA");
    },
  },
}));

import { createApp } from "../../app";
import { prisma } from "../../db";
import { selectMakerworldProfiles } from "../../services/makerworldCloudApi";

const app = createApp();
const stamp = Date.now();
let token: string;
const auth = () => ({ Authorization: `Bearer ${token}` });
const originalFetch = global.fetch;

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

const DESIGNER = { uid: 1692606088, name: "Deus Cat" };
/** Two designer profiles and two community ones. */
function design(designId: string) {
  return {
    id: Number(designId),
    modelId: `US${designId}`,
    title: "Articulated Phoenix",
    summary: "<p>A phoenix.</p>",
    tags: ["phoenix"],
    coverUrl: "https://makerworld.bblmw.com/phoenix/cover.jpg",
    designCreator: DESIGNER,
    defaultInstanceId: 2,
    instances: [
      { id: 1, profileId: 101, title: "Single-colour version", instanceCreator: DESIGNER },
      { id: 2, profileId: 102, title: "multi-colored version", instanceCreator: DESIGNER },
      { id: 3, profileId: 103, title: "Tail Color", instanceCreator: { uid: 740193827, name: "BlomsD" } },
      { id: 4, profileId: 104, title: "0.16mm layer", instanceCreator: { uid: 356629145, name: "gekkoace" } },
    ],
  };
}

describe("selectMakerworldProfiles", () => {
  const d = design("1");
  it("takes the link's profile, else the default -- a plain single import", () => {
    expect(selectMakerworldProfiles(d, "url", "3")).toEqual(["3"]);
    expect(selectMakerworldProfiles(d, "url", null)).toEqual(["2"]);
    expect(selectMakerworldProfiles(d, "url", "999")).toEqual(["2"]);
  });

  it("takes the designer's own profiles, the link's (or default) one first", () => {
    expect(selectMakerworldProfiles(d, "designer", null)).toEqual(["2", "1"]);
    // The link's profile comes first even when it's a community one.
    expect(selectMakerworldProfiles(d, "designer", "4")).toEqual(["4", "1", "2"]);
  });

  it("takes every profile", () => {
    expect(selectMakerworldProfiles(d, "all", null)).toEqual(["2", "1", "3", "4"]);
  });
});

function mockMakerworld(designId: string) {
  const fetched: string[] = [];
  global.fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async (input) => {
    const url = String(input);
    fetched.push(url);
    if (url === `https://api.bambulab.com/v1/design-service/design/${designId}`) return json(design(designId));
    const profile = url.match(/^https:\/\/api\.bambulab\.com\/v1\/iot-service\/api\/user\/profile\/(\d+)/);
    if (profile)
      return json({
        message: "success",
        url: `https://s3.example.com/phoenix-${profile[1]}.stl`,
        filename: `phoenix-${profile[1]}.stl`,
      });
    const file = url.match(/^https:\/\/s3\.example\.com\/phoenix-(\d+)\.stl$/);
    if (file)
      return new Response(`solid phoenix-${file[1]}\nendsolid\n`, {
        headers: { "content-type": "application/octet-stream" },
      });
    if (url === "https://makerworld.bblmw.com/phoenix/cover.jpg") {
      return new Response(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64",
        ),
        {
          headers: { "content-type": "image/png" },
        },
      );
    }
    return new Response("not found", { status: 404 }); // e.g. the author profile, behind Cloudflare
  }) as unknown as typeof fetch;
  return fetched;
}

async function runJob(designId: string, scope: "designer" | "all") {
  const start = await request(app)
    .post("/api/import/makerworld-profiles")
    .set(auth())
    .send({
      url: `https://makerworld.com/en/models/${designId}-articulated-phoenix`,
      scope,
      makerworld_cookie: "token=test-bearer",
    });
  expect(start.status).toBe(202);
  let job = (await request(app).get(`/api/import/jobs/${start.body.job_id}`).set(auth())).body;
  for (let i = 0; i < 100 && job.status === "RUNNING"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    job = (await request(app).get(`/api/import/jobs/${start.body.job_id}`).set(auth())).body;
  }
  return job;
}

describe("importing several MakerWorld print profiles", () => {
  beforeAll(async () => {
    const res = await request(app)
      .post("/api/register")
      .send({
        displayName: "Profiles Import Test",
        email: `mw-profiles-${stamp}@example.com`,
        password: "password123",
      });
    token = res.body.token;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("imports every designer profile as one model with a file per profile", async () => {
    const designId = String(stamp % 1_000_000_000);
    mockMakerworld(designId);
    const job = await runJob(designId, "designer");
    expect(job).toMatchObject({
      status: "DONE",
      type: "PROFILES",
      total: 2,
      imported: 2,
      failed_count: 0,
      source_label: "Articulated Phoenix",
    });

    const print = await prisma.print.findUniqueOrThrow({
      where: { id: job.result_print_id },
      include: { plates: { orderBy: { position: "asc" } } },
    });
    // The default profile created the model, then the designer's other one.
    expect(print.plates.map((p) => [p.sourceInstanceId, p.filename])).toEqual([
      ["2", "phoenix-102.stl"],
      ["1", "phoenix-101.stl"],
    ]);
  });

  it("adds the community profiles to a model that already has the designer's", async () => {
    const designId = String(stamp % 1_000_000_000);
    mockMakerworld(designId);
    const job = await runJob(designId, "all");
    expect(job).toMatchObject({ status: "DONE", total: 4, imported: 2, already_in_library: 2, failed_count: 0 });
    const plates = await prisma.plate.findMany({ where: { printId: job.result_print_id } });
    expect(plates.map((p) => p.sourceInstanceId).toSorted()).toEqual(["1", "2", "3", "4"]);
  });

  it("refuses a link that isn't a MakerWorld model", async () => {
    const res = await request(app)
      .post("/api/import/makerworld-profiles")
      .set(auth())
      .send({ url: "https://www.printables.com/model/1-x", scope: "all" });
    expect(res.status).toBe(400);
  });
});

describe("adding a profile the extension already resolved", () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches just the file, not the MakerWorld model page again", async () => {
    const designId = String((stamp % 1_000_000_000) + 50);
    const fetched: string[] = [];
    global.fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async (input) => {
      const url = String(input);
      fetched.push(url);
      if (url.startsWith(`https://makerworld.com/en/models/${designId}`)) {
        return new Response("<html><head><title>Phoenix</title></head><body></body></html>", {
          headers: { "content-type": "text/html" },
        });
      }
      const file = url.match(/^https:\/\/s3\.example\.com\/ext-(\d+)\.stl$/);
      if (file)
        return new Response(`solid ext-${file[1]}\nendsolid\n`, {
          headers: { "content-type": "application/octet-stream" },
        });
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const importProfile = (instanceId: string) =>
      request(app)
        .post("/api/import")
        .set({ ...auth(), "X-Thingport-Client": "grab" })
        .send({
          url: `https://makerworld.com/en/models/${designId}-phoenix`,
          resolved_download_url: `https://s3.example.com/ext-${instanceId}.stl`,
          resolved_instance_id: instanceId,
        });
    expect((await importProfile("11")).status).toBe(200);
    const pageFetchesAfterFirst = fetched.filter((u) => u.startsWith("https://makerworld.com/en/models/")).length;
    const second = await importProfile("12");
    expect(second.status).toBe(200);
    expect(second.body.import_outcome).toBe("profile_added");
    expect(fetched.filter((u) => u.startsWith("https://makerworld.com/en/models/")).length).toBe(pageFetchesAfterFirst);
  });
});
