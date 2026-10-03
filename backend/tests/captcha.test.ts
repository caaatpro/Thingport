import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { createCaptcha } from "../src/services/captchaService";
import { getCaptchaSettings, setCaptchaSettings } from "../src/services/settingsService";

const app = createApp();
const stamp = Date.now();
const email = (name: string) => `${name}-${stamp}@example.com`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const ALL_OFF = { login: false, register: false, import: false, change_password: false, change_email: false };

let adminToken: string;
let memberToken: string;
// The database is shared across files, so restore the settings afterwards.
let previousSettings: Awaited<ReturnType<typeof getCaptchaSettings>>;

/** The HTTP endpoint never reveals the answer. */
function solved(): { captcha_id: string; captcha_answer: string } {
  const { id, answer } = createCaptcha();
  return { captcha_id: id, captcha_answer: answer };
}

beforeAll(async () => {
  previousSettings = await getCaptchaSettings();
  await setCaptchaSettings(ALL_OFF);

  const adminRegister = await request(app)
    .post("/api/register")
    .send({ displayName: "Captcha Admin", email: email("captcha-admin"), password: "password123" });
  await prisma.user.update({ where: { id: adminRegister.body.user.id }, data: { role: "ADMIN" } });
  adminToken = (
    await request(app)
      .post("/api/login")
      .send({ email: email("captcha-admin"), password: "password123" })
  ).body.token;

  const memberRegister = await request(app)
    .post("/api/register")
    .send({ displayName: "Captcha Member", email: email("captcha-member"), password: "password123" });
  memberToken = memberRegister.body.token;
});

afterEach(async () => {
  vi.useRealTimers();
  await setCaptchaSettings(ALL_OFF);
});

afterAll(async () => {
  await setCaptchaSettings(previousSettings);
});

describe("captcha settings", () => {
  it("are all off by default and readable without signing in", async () => {
    const res = await request(app).get("/api/captcha/settings");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(ALL_OFF);
  });

  it("can only be changed by an admin, one place at a time", async () => {
    expect(
      (await request(app).patch("/api/settings/captcha").set(auth(memberToken)).send({ login: true })).status,
    ).toBe(403);
    const res = await request(app).patch("/api/settings/captcha").set(auth(adminToken)).send({ login: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...ALL_OFF, login: true });
  });
});

describe("GET /api/captcha", () => {
  it("returns an image and an id, but not the answer", async () => {
    const res = await request(app).get("/api/captcha");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).toSorted()).toEqual(["id", "image"]);
    expect(res.body.image).toMatch(/^data:image\/svg\+xml;base64,/);
    const svg = Buffer.from(res.body.image.split(",")[1], "base64").toString("utf8");
    // Drawn as outlines, so there's no text to read out of the SVG.
    expect(svg).toContain("<path");
    expect(svg).not.toContain("<text");
  });
});

describe("captcha on login", () => {
  const login = (extra: object = {}) =>
    request(app)
      .post("/api/login")
      .send({ email: email("captcha-member"), password: "password123", ...extra });

  it("isn't asked for while turned off", async () => {
    expect((await login()).status).toBe(200);
  });

  it("is required once turned on, and must match", async () => {
    await setCaptchaSettings({ login: true });
    const missing = await login();
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("CAPTCHA_REQUIRED");

    const wrong = await login({ captcha_id: createCaptcha().id, captcha_answer: "wrong" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe("CAPTCHA_INVALID");

    expect((await login(solved())).status).toBe(200);
  });

  it("is case-insensitive", async () => {
    await setCaptchaSettings({ login: true });
    const { captcha_id, captcha_answer } = solved();
    const swapped = [...captcha_answer]
      .map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))
      .join("");
    expect((await login({ captcha_id, captcha_answer: ` ${swapped} ` })).status).toBe(200);
  });

  it("works only once", async () => {
    await setCaptchaSettings({ login: true });
    const captcha = solved();
    expect((await login(captcha)).status).toBe(200);
    expect((await login(captcha)).status).toBe(400);
  });

  it("expires", async () => {
    await setCaptchaSettings({ login: true });
    vi.useFakeTimers({ toFake: ["Date"] });
    const captcha = solved();
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    expect((await login(captcha)).body.code).toBe("CAPTCHA_INVALID");
  });

  it("is checked before the password, so a wrong password still costs a captcha", async () => {
    await setCaptchaSettings({ login: true });
    const res = await request(app)
      .post("/api/login")
      .send({ email: email("captcha-member"), password: "nope" });
    expect(res.body.code).toBe("CAPTCHA_REQUIRED");
  });

  it("can't be skipped by claiming to be Thingport Grab (header or extension Origin)", async () => {
    await setCaptchaSettings({ login: true });
    // Any script can send these, so they must not waive the captcha that guards password guessing.
    expect((await login().set("X-Thingport-Client", "grab")).body.code).toBe("CAPTCHA_REQUIRED");
    expect(
      (await login().set("Origin", "chrome-extension://kahfidpmojfocohinlmglnfoaimocbol")).body.code,
    ).toBe("CAPTCHA_REQUIRED");
    expect((await login().set("Origin", "moz-extension://1b2c3d4e-0000-4000-8000-123456789abc")).body.code).toBe(
      "CAPTCHA_REQUIRED",
    );
  });

  it("is still asked of the web app's own requests", async () => {
    await setCaptchaSettings({ login: true });
    expect((await login().set("Origin", "https://thingport.example.com")).body.code).toBe("CAPTCHA_REQUIRED");
  });
});

describe("captcha on registration", () => {
  const register = (name: string, extra: object = {}) =>
    request(app)
      .post("/api/register")
      .send({ displayName: name, email: email(name), password: "password123", ...extra });

  it("is required once turned on", async () => {
    await setCaptchaSettings({ register: true });
    expect((await register("reg-no-captcha")).body.code).toBe("CAPTCHA_REQUIRED");
    expect(await prisma.user.findUnique({ where: { email: email("reg-no-captcha") } })).toBeNull();
    expect((await register("reg-captcha", solved())).status).toBe(200);
  });

  it("doesn't affect login", async () => {
    await setCaptchaSettings({ register: true });
    expect(
      (
        await request(app)
          .post("/api/login")
          .send({ email: email("captcha-member"), password: "password123" })
      ).status,
    ).toBe(200);
  });
});

describe("captcha on profile changes", () => {
  // Unchanged values keep the member's credentials (used by other tests) and skip the verification email.
  const changePassword = (extra: object = {}) =>
    request(app)
      .patch("/api/profile")
      .set(auth(memberToken))
      .send({ current_password: "password123", new_password: "password123", ...extra });
  const changeEmail = (extra: object = {}) =>
    request(app)
      .patch("/api/profile")
      .set(auth(memberToken))
      .send({ current_password: "password123", email: email("captcha-member"), ...extra });

  it("isn't asked for while turned off", async () => {
    expect((await changePassword()).status).toBe(200);
    expect((await changeEmail()).status).toBe(200);
  });

  it("guards each change only when its own place is on", async () => {
    await setCaptchaSettings({ change_password: true });
    expect((await changePassword()).body.code).toBe("CAPTCHA_REQUIRED");
    expect((await changePassword(solved())).status).toBe(200);
    expect((await changeEmail()).status).toBe(200);

    await setCaptchaSettings({ change_password: false, change_email: true });
    expect((await changeEmail()).body.code).toBe("CAPTCHA_REQUIRED");
    expect((await changeEmail(solved())).status).toBe(200);
    expect((await changePassword()).status).toBe(200);
  });

  it("is checked before the current password", async () => {
    await setCaptchaSettings({ change_password: true });
    const res = await changePassword({ current_password: "wrong-password" });
    expect(res.body.code).toBe("CAPTCHA_REQUIRED");
  });
});

describe("captcha on import", () => {
  it("guards every endpoint that starts an import, but not the previews", async () => {
    await setCaptchaSettings({ import: true });
    const starts: [string, object][] = [
      ["/api/import", { url: "https://example.com/model.stl" }],
      ["/api/import/zip", { url: "https://example.com/models.zip", entries: ["a.stl"] }],
      ["/api/import/collection", { url: "https://makerworld.com/en/collections/1", design_ids: ["1"] }],
      ["/api/import/thingiverse-likes", { url: "https://www.thingiverse.com/someone/likes", thing_ids: ["1"] }],
      [
        "/api/import/thingiverse-collection",
        { url: "https://www.thingiverse.com/someone/collections/1", thing_ids: ["1"] },
      ],
      [
        "/api/import/printables-collection",
        { url: "https://www.printables.com/@someone/collections/1", model_ids: ["1"] },
      ],
    ];
    const codes: Record<string, string> = {};
    for (const [path, body] of starts) {
      codes[path] = (await request(app).post(path).set(auth(memberToken)).send(body)).body.code;
    }
    expect(codes).toEqual(Object.fromEntries(starts.map(([path]) => [path, "CAPTCHA_REQUIRED"])));
    // Import status is a read, not an import -- no captcha.
    const status = await request(app)
      .get("/api/import/status")
      .query({ url: "https://example.com/model.stl" })
      .set(auth(memberToken));
    expect(status.body.code).not.toBe("CAPTCHA_REQUIRED");
  });

  it("lets an import through with a solved captcha, or with an API token", async () => {
    await setCaptchaSettings({ import: true });
    // Nothing listens here, so the import fails, but only after the captcha.
    const body = { url: "http://127.0.0.1:9/model.stl" };
    const captchaCodes = ["CAPTCHA_REQUIRED", "CAPTCHA_INVALID"];
    const withCaptcha = await request(app)
      .post("/api/import")
      .set(auth(memberToken))
      .send({ ...body, ...solved() });
    expect(captchaCodes).not.toContain(withCaptcha.body.code);

    // A token the user created on purpose is a credential in its own right: no captcha.
    const created = await request(app).post("/api/tokens").set(auth(memberToken)).send({ name: "captcha test" });
    expect(created.status).toBe(201);
    const fromGrab = await request(app)
      .post("/api/import")
      .set({ Authorization: `Bearer ${created.body.token}` })
      .send(body);
    expect(captchaCodes).not.toContain(fromGrab.body.code);

    // ...but merely sending the old Grab header with a normal session doesn't waive it.
    const forged = await request(app)
      .post("/api/import")
      .set({ ...auth(memberToken), "X-Thingport-Client": "grab" })
      .send(body);
    expect(forged.body.code).toBe("CAPTCHA_REQUIRED");
  });
});
