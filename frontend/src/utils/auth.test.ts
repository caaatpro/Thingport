import { beforeEach, describe, expect, it } from "vitest";
import type { AuthUser } from "../api/auth";
import {
  appendTokenToUrl,
  authHeaders,
  clearToken,
  clearUser,
  readToken,
  readUser,
  storeToken,
  storeUser,
} from "./auth";

const user = { id: "u1", email: "a@example.test", display_name: "A", role: "ADMIN" } as AuthUser;

beforeEach(() => window.localStorage.clear());

describe("token and user storage", () => {
  it("round-trips and clears the token", () => {
    expect(readToken()).toBeNull();
    storeToken("tok");
    expect(readToken()).toBe("tok");
    clearToken();
    expect(readToken()).toBeNull();
  });

  it("round-trips and clears the user", () => {
    expect(readUser()).toBeNull();
    storeUser(user);
    expect(readUser()).toEqual(user);
    clearUser();
    expect(readUser()).toBeNull();
  });

  it("treats a corrupted stored user as signed out", () => {
    window.localStorage.setItem("thingport_auth_user", "{not json");
    expect(readUser()).toBeNull();
  });
});

describe("authHeaders", () => {
  it("adds the bearer token only when there is one", () => {
    expect(authHeaders().has("Authorization")).toBe(false);
    storeToken("tok");
    expect(authHeaders().get("Authorization")).toBe("Bearer tok");
  });

  it("keeps the headers it is given", () => {
    storeToken("tok");
    const h = authHeaders({ "Content-Type": "application/json" });
    expect(h.get("Content-Type")).toBe("application/json");
    expect(h.get("Authorization")).toBe("Bearer tok");
  });
});

describe("appendTokenToUrl", () => {
  it("leaves the URL alone without a token", () => {
    expect(appendTokenToUrl("/api/plate/1/file/x.stl")).toBe("/api/plate/1/file/x.stl");
  });

  it("adds the token as a query parameter, keeping existing ones", () => {
    storeToken("a b");
    const url = new URL(appendTokenToUrl("/api/plate/1/thumb.jpg?v=3"), "http://localhost");
    expect(url.searchParams.get("v")).toBe("3");
    expect(url.searchParams.get("token")).toBe("a b");
  });
});
