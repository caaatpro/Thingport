import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { setThingiverseAccessToken } from "../system";
import { prisma } from "../../db";

const ACCESS_TOKEN = "test-access-token";
const USERNAME = "Derzinskas";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function likeEntry(id: number) {
  return { id, name: `Liked Thing ${id}`, thumbnail: `https://cdn.thingiverse.com/assets/test/${id}.jpg` };
}

describe("POST /import/thingiverse-likes/entries", () => {
  const app = createApp();
  let token: string;
  let userId: string;
  const originalFetch = global.fetch;

  beforeAll(async () => {
    const email = `thingiverse-likes-route-test-${Date.now()}@example.com`;
    const res = await request(app)
      .post("/api/register")
      .send({ displayName: "Likes Route Test", email, password: "password123" });
    if (res.status !== 200) {
      throw new Error(`Failed to register during test setup: ${res.status} ${JSON.stringify(res.body)}`);
    }
    token = res.body.token;
    userId = res.body.user.id;
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    await setThingiverseAccessToken(null);
  });

  it("fails with a clear 503 when no Access Token is configured", async () => {
    const res = await request(app)
      .post("/api/import/thingiverse-likes/entries")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: `https://www.thingiverse.com/${USERNAME}/likes`, tags: [] });
    expect(res.status).toBe(503);
    expect(res.body.detail).toMatch(/isn't configured/i);
  });

  it("lists a user's liked Things as importable entries", async () => {
    await setThingiverseAccessToken(ACCESS_TOKEN);
    global.fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () =>
      jsonResponse(200, [likeEntry(1), likeEntry(2)]),
    ) as unknown as typeof fetch;

    const res = await request(app)
      .post("/api/import/thingiverse-likes/entries")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: `https://www.thingiverse.com/${USERNAME}/likes`, tags: [] });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe(`${USERNAME}'s Thingiverse Likes`);
    expect(res.body.entries).toEqual([
      {
        design_id: "1",
        title: "Liked Thing 1",
        cover: "https://cdn.thingiverse.com/assets/test/1.jpg",
        already_imported: false,
      },
      {
        design_id: "2",
        title: "Liked Thing 2",
        cover: "https://cdn.thingiverse.com/assets/test/2.jpg",
        already_imported: false,
      },
    ]);
  });

  it("flags entries already in the user's library instead of letting them be re-selected", async () => {
    await setThingiverseAccessToken(ACCESS_TOKEN);
    await prisma.print.create({
      data: {
        userId,
        name: "Already imported",
        nameNormalized: "already imported",
        sourceProvider: "thingiverse",
        sourceExternalId: "1",
      },
    });
    global.fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () =>
      jsonResponse(200, [likeEntry(1), likeEntry(2)]),
    ) as unknown as typeof fetch;

    const res = await request(app)
      .post("/api/import/thingiverse-likes/entries")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: `https://www.thingiverse.com/${USERNAME}/likes`, tags: [] });

    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([
      {
        design_id: "1",
        title: "Liked Thing 1",
        cover: "https://cdn.thingiverse.com/assets/test/1.jpg",
        already_imported: true,
      },
      {
        design_id: "2",
        title: "Liked Thing 2",
        cover: "https://cdn.thingiverse.com/assets/test/2.jpg",
        already_imported: false,
      },
    ]);
  });

  it("rejects a URL that isn't a Thingiverse Likes page", async () => {
    await setThingiverseAccessToken(ACCESS_TOKEN);
    const res = await request(app)
      .post("/api/import/thingiverse-likes/entries")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: "https://www.thingiverse.com/thing:763622", tags: [] });
    expect(res.status).toBe(400);
  });
});
