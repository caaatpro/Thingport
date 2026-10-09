import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app";
import { prisma } from "../../db";

// Three fixed metrics, like MakerWorld's sort row.

const app = createApp();
let token: string;
let userId: string;

beforeAll(async () => {
  const email = `prints-sort-test-${Date.now()}@example.com`;
  const res = await request(app)
    .post("/api/register")
    .send({ displayName: "Prints Sort Test", email, password: "password123" });
  if (res.status !== 200) {
    throw new Error(`Failed to register during test setup: ${res.status} ${JSON.stringify(res.body)}`);
  }
  token = res.body.token;
  userId = res.body.user.id;
});

function auth() {
  return { Authorization: `Bearer ${token}` };
}

describe("GET /prints -- orderBy", () => {
  let oldestId: string;
  let middleId: string;
  let newestId: string;

  beforeAll(async () => {
    // Deliberately uncorrelated values, so each sort only passes by reading its own field.
    const oldest = await prisma.print.create({
      data: {
        userId,
        name: "Sort Oldest",
        nameNormalized: "sort oldest",
        createdAt: new Date("2020-01-01T00:00:00Z"),
        viewCount: 100,
        printCount: 1,
      },
    });
    const middle = await prisma.print.create({
      data: {
        userId,
        name: "Sort Middle",
        nameNormalized: "sort middle",
        createdAt: new Date("2021-01-01T00:00:00Z"),
        viewCount: 50,
        printCount: 5,
      },
    });
    const newest = await prisma.print.create({
      data: {
        userId,
        name: "Sort Newest",
        nameNormalized: "sort newest",
        createdAt: new Date("2022-01-01T00:00:00Z"),
        viewCount: 10,
        printCount: 20,
      },
    });
    oldestId = oldest.id;
    middleId = middle.id;
    newestId = newest.id;
  });

  it("defaults to newest-first (createdAt desc) when orderBy is omitted", async () => {
    const res = await request(app).get("/api/prints").set(auth());
    expect(res.status).toBe(200);
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids.indexOf(newestId)).toBeLessThan(ids.indexOf(middleId));
    expect(ids.indexOf(middleId)).toBeLessThan(ids.indexOf(oldestId));
  });

  it("orderBy=newest sorts by createdAt desc explicitly", async () => {
    const res = await request(app).get("/api/prints").set(auth()).query({ orderBy: "newest" });
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids.indexOf(newestId)).toBeLessThan(ids.indexOf(middleId));
    expect(ids.indexOf(middleId)).toBeLessThan(ids.indexOf(oldestId));
  });

  it("orderBy=popular sorts by view count desc", async () => {
    const res = await request(app).get("/api/prints").set(auth()).query({ orderBy: "popular" });
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids.indexOf(oldestId)).toBeLessThan(ids.indexOf(middleId));
    expect(ids.indexOf(middleId)).toBeLessThan(ids.indexOf(newestId));
  });

  it("orderBy=downloads sorts by print count desc", async () => {
    const res = await request(app).get("/api/prints").set(auth()).query({ orderBy: "downloads" });
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids.indexOf(newestId)).toBeLessThan(ids.indexOf(middleId));
    expect(ids.indexOf(middleId)).toBeLessThan(ids.indexOf(oldestId));
  });

  it("falls back to newest for an unrecognized orderBy value", async () => {
    const res = await request(app).get("/api/prints").set(auth()).query({ orderBy: "bogus" });
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids.indexOf(newestId)).toBeLessThan(ids.indexOf(middleId));
    expect(ids.indexOf(middleId)).toBeLessThan(ids.indexOf(oldestId));
  });
});
