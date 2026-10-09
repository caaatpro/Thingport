import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// The mailer is mocked; tests read the reset token from its calls.
vi.mock("./mailer", () => ({
  sendVerificationEmail: vi.fn<(to: string, displayName: string, token: string) => Promise<void>>(
    async () => undefined,
  ),
  sendInvitationEmail: vi.fn<(to: string, inviterName: string, link: string, expiresInDays: number) => Promise<void>>(
    async () => undefined,
  ),
  sendPasswordResetEmail: vi.fn<(to: string, displayName: string, token: string) => Promise<void>>(
    async () => undefined,
  ),
}));

import { createApp } from "../../app";
import { prisma } from "../../db";
import { sendPasswordResetEmail } from "./mailer";
import { getSmtpSettings, setSmtpSettings } from "../system/index";

const app = createApp();
const sendReset = vi.mocked(sendPasswordResetEmail);
const stamp = Date.now();
const email = (name: string) => `${name}-${stamp}@example.com`;
// The database is shared across files, so restore the SMTP host afterwards.
let previousSmtpHost: string | null;

const forgot = (address: string) => request(app).post("/api/forgot-password").send({ email: address });
const reset = (token: string, password: string) =>
  request(app).post("/api/reset-password").send({ token, new_password: password });
const login = (address: string, password: string) => request(app).post("/api/login").send({ email: address, password });

async function registerUser(name: string): Promise<void> {
  await request(app)
    .post("/api/register")
    .send({ displayName: name, email: email(name), password: "password123" });
}

/** Asks for a link and returns the token from the (mocked) email. */
async function requestToken(name: string): Promise<string> {
  sendReset.mockClear();
  expect((await forgot(email(name))).status).toBe(200);
  expect(sendReset).toHaveBeenCalledTimes(1);
  return sendReset.mock.calls[0][2];
}

beforeAll(async () => {
  previousSmtpHost = (await getSmtpSettings()).host;
  // Registered without SMTP so they skip email verification.
  await setSmtpSettings({ host: null });
  for (const name of ["reset-a", "reset-b", "reset-c", "reset-d", "reset-e", "reset-f", "reset-off"])
    await registerUser(name);
});

afterAll(async () => {
  await setSmtpSettings({ host: previousSmtpHost });
});

beforeEach(async () => {
  sendReset.mockClear();
  await setSmtpSettings({ host: "smtp.example.test" });
});

describe("password reset", () => {
  it("is only offered on the sign-in form with SMTP configured", async () => {
    expect((await request(app).get("/api/health")).body.password_reset_enabled).toBe(true);
    await setSmtpSettings({ host: null });
    expect((await request(app).get("/api/health")).body.password_reset_enabled).toBe(false);
  });

  it("doesn't send anything without SMTP", async () => {
    await setSmtpSettings({ host: null });
    expect((await forgot(email("reset-off"))).status).toBe(200);
    expect(sendReset).not.toHaveBeenCalled();
  });

  it("answers the same for unknown emails, without sending", async () => {
    const known = await forgot(email("reset-a"));
    const unknown = await forgot(email("nobody"));
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(sendReset).toHaveBeenCalledTimes(1);
  });

  it("sets the new password and signs in", async () => {
    const token = await requestToken("reset-b");
    expect((await request(app).get(`/api/reset-password/${token}`)).body.email).toBe(email("reset-b"));

    const res = await reset(token, "new-password-1");
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(email("reset-b"));
    expect((await login(email("reset-b"), "password123")).status).toBe(401);
    expect((await login(email("reset-b"), "new-password-1")).status).toBe(200);
  });

  it("records the request and the reset in the admin logs", async () => {
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: email("reset-b") } })).id;
    const actions = async () =>
      (await prisma.log.findMany({ where: { userId }, select: { action: true } })).map((l) => l.action);
    // Logging is fire-and-forget, so it can land just after the response.
    await expect.poll(actions).toEqual(expect.arrayContaining(["password_reset_requested", "password_reset"]));
  });

  it("only stores a hash of the token", async () => {
    const token = await requestToken("reset-c");
    const user = await prisma.user.findUnique({ where: { email: email("reset-c") } });
    expect(user?.passwordResetTokenHash).toBeTruthy();
    expect(user?.passwordResetTokenHash).not.toBe(token);
  });

  it("works only once", async () => {
    const token = await requestToken("reset-d");
    expect((await reset(token, "new-password-1")).status).toBe(200);
    expect((await reset(token, "new-password-2")).status).toBe(400);
    expect((await request(app).get(`/api/reset-password/${token}`)).status).toBe(400);
  });

  it("expires", async () => {
    const token = await requestToken("reset-e");
    await prisma.user.update({
      where: { email: email("reset-e") },
      data: { passwordResetExpires: new Date(Date.now() - 1000) },
    });
    expect((await reset(token, "new-password-1")).status).toBe(400);
    expect((await login(email("reset-e"), "password123")).status).toBe(200);
  });

  it("won't email the same account again within a minute", async () => {
    await requestToken("reset-f");
    await forgot(email("reset-f"));
    expect(sendReset).toHaveBeenCalledTimes(1);
  });

  it("rejects short passwords and unknown tokens", async () => {
    expect((await reset("not-a-token", "new-password-1")).status).toBe(400);
    expect((await reset("not-a-token", "short")).status).toBe(400);
  });
});
