import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchThingiverseUserLikes, parseThingiverseLikesUrl } from "./thingiverse";

const ACCESS_TOKEN = "test-access-token";
const USERNAME = "Derzinskas";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function likeEntry(id: number) {
  return { id, name: `Liked Thing ${id}`, thumbnail: `https://cdn.thingiverse.com/assets/test/${id}.jpg` };
}

describe("parseThingiverseLikesUrl", () => {
  it("recognizes a user's Likes page", () => {
    expect(parseThingiverseLikesUrl("https://www.thingiverse.com/Derzinskas/likes")).toEqual({
      username: "Derzinskas",
    });
    expect(parseThingiverseLikesUrl("https://thingiverse.com/someone/likes/")).toEqual({ username: "someone" });
  });

  it("rejects a single Thing URL and unrelated hosts", () => {
    expect(parseThingiverseLikesUrl("https://www.thingiverse.com/thing:763622")).toBeNull();
    expect(parseThingiverseLikesUrl("https://example.com/someone/likes")).toBeNull();
  });
});

describe("fetchThingiverseUserLikes", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("pages through multiple pages until a short page signals the end", async () => {
    global.fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async (input) => {
      const url = String(input);
      const pageMatch = url.match(/page=(\d+)/);
      const page = pageMatch ? Number(pageMatch[1]) : 1;
      if (page === 1)
        return jsonResponse(
          200,
          Array.from({ length: 30 }, (_, i) => likeEntry(i + 1)),
        );
      if (page === 2)
        return jsonResponse(
          200,
          Array.from({ length: 5 }, (_, i) => likeEntry(31 + i)),
        );
      throw new Error(`Unexpected page ${page}`);
    }) as unknown as typeof fetch;

    const result = await fetchThingiverseUserLikes(USERNAME, ACCESS_TOKEN);
    expect(result.entries.length).toBe(35);
    expect(result.truncated).toBe(false);
    expect(result.entries[0]).toEqual({
      thingId: "1",
      title: "Liked Thing 1",
      cover: "https://cdn.thingiverse.com/assets/test/1.jpg",
    });
  });

  it("stops at maxItems and reports truncated", async () => {
    global.fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () =>
      jsonResponse(
        200,
        Array.from({ length: 30 }, (_, i) => likeEntry(i + 1)),
      ),
    ) as unknown as typeof fetch;

    const result = await fetchThingiverseUserLikes(USERNAME, ACCESS_TOKEN, 10);
    expect(result.entries.length).toBe(10);
    expect(result.truncated).toBe(true);
  });

  it("returns an empty result for a user with no likes (or who doesn't exist)", async () => {
    global.fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () =>
      jsonResponse(200, []),
    ) as unknown as typeof fetch;

    const result = await fetchThingiverseUserLikes(USERNAME, ACCESS_TOKEN);
    expect(result.entries).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});
