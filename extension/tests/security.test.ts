// Run with `npm test` (Node's built-in test runner through tsx -- no extra dependencies). Covers the
// pure functions that decide what the extension may talk to and with what.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isApiCallAllowed } from "../src/shared/apiPolicy";
import { instanceUrlProblem, isApiToken, isPrivateHost } from "../src/shared/storage";
import { isMakerworldUrl, isProviderPageUrl, parseMakerworldModelUrl, parseCults3dModelUrl, classifyUrl } from "../src/shared/urls";

describe("isApiCallAllowed (the endpoints the extension may call)", () => {
  it("allows exactly what the extension uses", () => {
    for (const [method, path] of [
      ["GET", "/token/self"],
      ["GET", "/collections"],
      ["POST", "/collections"],
      ["POST", "/collection/abc/items/def"],
      ["POST", "/import"],
      ["POST", "/import/zip"],
      ["POST", "/import/zip/entries"],
      ["POST", "/import/inspect"],
      ["POST", "/import/thingiverse-likes/entries"],
      ["POST", "/import/printables-collection"],
      ["GET", "/import/status?url=https%3A%2F%2Fmakerworld.com%2Fen%2Fmodels%2F1"],
      ["GET", "/import/jobs/abc123"],
      ["GET", "/settings/slicer"],
      ["PATCH", "/settings/makerworld"],
      ["GET", "/plate/abc/thumb.jpg?v=123"],
      ["GET", "/preview-image/abc/file.jpg"],
    ] as const) {
      assert.equal(isApiCallAllowed(method, path), true, `${method} ${path}`);
    }
  });

  it("refuses everything else, including destructive and account endpoints", () => {
    for (const [method, path] of [
      ["GET", "/prints"],
      ["DELETE", "/print/abc"],
      ["POST", "/print/abc/meta"],
      ["PUT", "/print/abc/shares"],
      ["GET", "/users"],
      ["GET", "/admin/users"],
      ["GET", "/tokens"],
      ["POST", "/tokens"],
      ["DELETE", "/tokens/abc"],
      ["POST", "/login"],
      ["POST", "/profile/password"],
      ["DELETE", "/collection/abc/items/def"],
      ["DELETE", "/collections"],
      ["PUT", "/settings/makerworld"],
      ["GET", "/settings/auth"],
    ] as const) {
      assert.equal(isApiCallAllowed(method, path), false, `${method} ${path}`);
    }
  });

  it("refuses paths that try to climb out or sneak in encoded separators", () => {
    for (const path of [
      "/collections/../prints",
      "/import/../prints",
      "/collection/a/items/../../../tokens",
      "/collections//",
      "/collections/%2e%2e/prints",
      "/collection/a%2Fb/items/c",
      "/collection\\a/items/b",
      "collections",
      "",
    ]) {
      assert.equal(isApiCallAllowed("GET", path), false, path);
      assert.equal(isApiCallAllowed("POST", path), false, path);
    }
  });
});

describe("instanceUrlProblem (where the token and MakerWorld session may be sent)", () => {
  it("accepts https anywhere", () => {
    assert.equal(instanceUrlProblem("https://thingport.example.com"), null);
    assert.equal(instanceUrlProblem("https://thingport.example.com/"), null);
    assert.equal(instanceUrlProblem("https://203.0.113.9:8443"), null);
  });

  it("accepts plain http only on loopback and private networks", () => {
    for (const url of [
      "http://localhost:8080",
      "http://127.0.0.1:8080",
      "http://172.16.0.202:8080",
      "http://192.168.1.10",
      "http://10.0.0.5:3000",
      "http://100.100.1.2", // Tailscale
      "http://nas",
      "http://thingport.local",
      "http://thingport.lan:8080",
      "http://[::1]:8080",
    ]) {
      assert.equal(instanceUrlProblem(url), null, url);
    }
  });

  it("rejects plain http on public hosts, where the token would cross the internet in the clear", () => {
    for (const url of ["http://thingport.example.com", "http://203.0.113.9", "http://8.8.8.8", "http://172.32.0.1"]) {
      assert.match(instanceUrlProblem(url) ?? "", /https/, url);
    }
  });

  it("rejects non-http schemes, embedded credentials and junk", () => {
    assert.ok(instanceUrlProblem("ftp://thingport.example.com"));
    assert.ok(instanceUrlProblem("javascript:alert(1)"));
    assert.ok(instanceUrlProblem("https://user:pass@thingport.example.com"));
    assert.ok(instanceUrlProblem("not a url"));
    assert.ok(instanceUrlProblem(""));
  });

  it("isPrivateHost boundaries", () => {
    assert.equal(isPrivateHost("172.15.0.1"), false);
    assert.equal(isPrivateHost("172.16.0.1"), true);
    assert.equal(isPrivateHost("172.31.255.255"), true);
    assert.equal(isPrivateHost("172.32.0.1"), false);
    assert.equal(isPrivateHost("100.63.0.1"), false);
    assert.equal(isPrivateHost("100.64.0.1"), true);
    assert.equal(isPrivateHost("example.com"), false);
  });
});

describe("isApiToken", () => {
  it("recognises the token format and nothing like a password", () => {
    assert.equal(isApiToken(`tpg_${"a".repeat(43)}`), true);
    assert.equal(isApiToken("tpg_short"), false);
    assert.equal(isApiToken("hunter2"), false);
    assert.equal(isApiToken(`tpg_${"a".repeat(300)}`), false);
    assert.equal(isApiToken(undefined), false);
    assert.equal(isApiToken("eyJhbGciOiJIUzI1NiJ9.e30.abc"), false); // an old session JWT
  });
});

describe("provider URL matching", () => {
  it("accepts the sites and their subdomains only", () => {
    assert.equal(isProviderPageUrl("https://makerworld.com/en/models/1"), true);
    assert.equal(isProviderPageUrl("https://www.printables.com/model/1"), true);
    assert.equal(isProviderPageUrl("https://www.thingiverse.com/thing:1"), true);
    assert.equal(isProviderPageUrl("https://api.makerworld.com/x"), true);
  });

  it("rejects lookalike domains and non-web pages", () => {
    assert.equal(isProviderPageUrl("https://evilmakerworld.com/en/models/1"), false);
    assert.equal(isProviderPageUrl("https://makerworld.com.evil.example/en/models/1"), false);
    assert.equal(isProviderPageUrl("https://example.com/makerworld.com"), false);
    assert.equal(isProviderPageUrl("chrome-extension://abc/popup.html"), false);
    assert.equal(isProviderPageUrl("javascript:alert(1)"), false);
    assert.equal(isProviderPageUrl(""), false);
  });

  it("doesn't treat a lookalike as MakerWorld (which would attach the session cookie)", () => {
    assert.equal(isMakerworldUrl("https://makerworld.com/en/models/123-benchy"), true);
    assert.equal(isMakerworldUrl("https://evilmakerworld.com/en/models/123-benchy"), false);
    assert.equal(parseMakerworldModelUrl("https://notmakerworld.com/en/models/123"), null);
  });
});

describe("Cults3D URLs", () => {
  it("recognises model pages with and without a locale prefix", () => {
    const expected = { category: "various", slug: "begode-t4-rear-handle" };
    assert.deepEqual(parseCults3dModelUrl("https://cults3d.com/en/3d-model/various/begode-t4-rear-handle"), expected);
    assert.deepEqual(parseCults3dModelUrl("https://cults3d.com/ru/3d-model/various/Begode-T4-Rear-Handle/"), expected);
    assert.deepEqual(parseCults3dModelUrl("https://cults3d.com/3d-model/various/begode-t4-rear-handle?x=1"), expected);
    assert.deepEqual(classifyUrl("https://cults3d.com/en/3d-model/various/begode-t4-rear-handle"), {
      kind: "single",
      provider: "cults3d",
      type: "model",
    });
  });

  it("ignores other Cults3D pages and lookalike domains", () => {
    assert.equal(parseCults3dModelUrl("https://cults3d.com/en/users/someone/creations"), null);
    assert.equal(parseCults3dModelUrl("https://cults3d.com/en/3d-model/various"), null);
    assert.equal(parseCults3dModelUrl("https://evilcults3d.com/en/3d-model/various/x"), null);
    assert.equal(isProviderPageUrl("https://cults3d.com/en"), true);
    assert.equal(isProviderPageUrl("https://cults3d.com.evil.example/en"), false);
  });
});
