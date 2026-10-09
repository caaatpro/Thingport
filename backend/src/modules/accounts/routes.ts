import type { Router } from "express";
import { createRouter } from "../../http/route";
import { rateLimit } from "../../http/rateLimit";
import { notFound, badRequest } from "../../http/errors";
import { createApiToken, describeApiToken, listApiTokens, revokeApiToken } from "./apiTokens";
import {
  createTokenSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from "./schemas";
import * as accounts from "./service";

/** Brute-force guard for sign-in, sign-up and the e-mail/password flows. */
const authLimiter = [rateLimit({ windowMs: 15 * 60 * 1000, max: 30 })];

const auth = createRouter();

auth.post("/register", { access: "public", use: authLimiter, body: registerSchema }, ({ body }) =>
  accounts.register(body),
);
auth.post("/login", { access: "public", use: authLimiter, body: loginSchema }, ({ body }) => accounts.login(body));
auth.get("/invitations/:token", { access: "public" }, ({ params }) => accounts.describeInvitation(params.token));
auth.post("/verify-email", { access: "public", use: authLimiter, body: verifyEmailSchema }, ({ body }) =>
  accounts.verifyEmail(body),
);
auth.post("/resend-verification", { access: "public", use: authLimiter, body: resendVerificationSchema }, ({ body }) =>
  accounts.resendVerification(body),
);
auth.post("/forgot-password", { access: "public", use: authLimiter, body: forgotPasswordSchema }, ({ body }) =>
  accounts.forgotPassword(body),
);
auth.get("/reset-password/:token", { access: "public" }, ({ params }) => accounts.describeResetToken(params.token));
auth.post("/reset-password", { access: "public", use: authLimiter, body: resetPasswordSchema }, ({ body }) =>
  accounts.resetPassword(body),
);

auth.patch("/profile", { body: updateProfileSchema }, ({ userId, body }) => accounts.updateProfile(userId, body));
auth.post("/logout", ({ userId }) => accounts.logout(userId));
auth.post("/refresh", ({ userId }) => accounts.refresh(userId));

// Member directory for the sharing picker.
auth.get("/users", ({ userId }) => accounts.listOtherUsers(userId));

// Who the calling API token belongs to, so a client (the extension) can confirm it's connected.
// Allowed for the "grab" scope; a session isn't an API token, so it gets a 400.
auth.get("/token/self", ({ req }) => {
  if (!req.apiToken) throw badRequest("This endpoint is for API tokens");
  return describeApiToken(req.apiToken.id);
});

// Management is session-only: an API token can't list, create or revoke tokens.
auth.get("/tokens", { access: "session" }, ({ userId }) => listApiTokens(userId));
auth.post("/tokens", { access: "session", body: createTokenSchema }, async ({ res, userId, body }) => {
  const created = await createApiToken(userId, {
    name: body.name,
    scope: body.scope,
    expiresInDays: body.expires_in_days,
  });
  res.status(201);
  return created;
});
auth.delete("/tokens/:id", { access: "session" }, async ({ userId, params }) => {
  if (!(await revokeApiToken(userId, params.id))) throw notFound("Token not found");
  return { ok: true };
});

export const routers: Router[] = [auth.router];
