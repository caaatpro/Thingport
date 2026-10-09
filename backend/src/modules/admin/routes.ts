import type { Router } from "express";
import { PUBLIC_URL } from "../../config";
import { prisma } from "../../db";
import { conflict, unauthorized } from "../../http/errors";
import { createRouter } from "../../http/route";
import { authorLinkingSummary, currentAuthorLinkingRun, startAuthorLinking } from "../library/index";
import { INVITATION_TTL_DAYS, inviteUser } from "../accounts/index";
import { enqueuePlate } from "../processing/index";
import { createLog } from "../system";
import { toAdminUserOut, toLogOut } from "./dto";
import { createUserSchema, inviteSchema, logsQuerySchema, signOutSchema, updateUserSchema } from "./schemas";
import { getAdminOverview, getStorageUsage, listLogs, listUsersWithPrintCounts } from "./service";
import {
  createPasswordResetToken,
  createUserAccount,
  deleteAllPrintsOfUser,
  deleteUserAccount,
  signOutUser,
  updateUserAccount,
} from "./userAdmin";

const admin = createRouter();

admin.get("/admin/users", { access: "admin" }, async () => (await listUsersWithPrintCounts()).map(toAdminUserOut));

admin.get("/admin/overview", { access: "admin" }, () => getAdminOverview());

admin.post("/admin/users", { access: "admin", body: createUserSchema }, async ({ body, userId, res }) => {
  const created = await createUserAccount(userId, {
    email: body.email,
    displayName: body.display_name,
    role: body.role,
    password: body.password,
  });
  res.status(201);
  return created;
});

admin.patch("/admin/users/:id", { access: "admin", body: updateUserSchema }, async ({ body, params, userId }) => {
  await updateUserAccount(userId, params.id, {
    displayName: body.display_name,
    role: body.role,
    disabled: body.disabled,
  });
  return { ok: true };
});

// Ends every browser session of the user; with revoke_tokens also the Thingport Grab tokens.
admin.post("/admin/users/:id/sign-out", { access: "admin", body: signOutSchema }, async ({ body, params, userId }) => ({
  ok: true,
  revoked_tokens: await signOutUser(userId, params.id, body.revoke_tokens),
}));

// A one-hour, single-use link the admin passes on, for instances without outgoing email.
admin.post("/admin/users/:id/reset-link", { access: "admin" }, async ({ params, req, userId }) => {
  const { token, expiresAt } = await createPasswordResetToken(userId, params.id);
  const base = PUBLIC_URL || (req.get("origin") ?? "").replace(/\/+$/, "");
  return { url: `${base}/reset-password?token=${encodeURIComponent(token)}`, expires_at: expiresAt };
});

// Irreversible; the UI confirms.
admin.delete("/admin/users/:id", { access: "admin" }, async ({ params, userId }) => ({
  ok: true,
  deleted_models: await deleteUserAccount(userId, params.id),
}));

// Plates whose background processing failed (thumbnail, geometry) get another go.
admin.post("/admin/processing/retry-failed", { access: "admin" }, async ({ userId }) => {
  const failed = await prisma.plate.findMany({ where: { processingStatus: "FAILED" }, select: { id: true } });
  for (const { id } of failed) await enqueuePlate(id);
  void createLog({ userId, action: "processing_retried", details: { plates: failed.length } });
  return { ok: true, retried: failed.length };
});

admin.get("/admin/storage", { access: "admin" }, async () => {
  const usage = await getStorageUsage();
  return { model_bytes: usage.modelBytes, model_count: usage.modelCount };
});

admin.get("/admin/logs", { access: "admin", query: logsQuerySchema }, async ({ query }) =>
  (await listLogs({ userId: query.user_id, from: query.from, to: query.to })).map(toLogOut),
);

// Re-inviting an address sends a fresh link and retires the old one.
admin.post("/admin/invitations", { access: "admin", body: inviteSchema }, async ({ body, req, userId }) => {
  const inviter = await prisma.user.findUnique({ where: { id: userId } });
  if (!inviter) throw unauthorized("Invalid or expired token");
  const invitation = await inviteUser({
    email: body.email,
    invitedById: inviter.id,
    inviterName: inviter.displayName,
    origin: req.get("origin") ?? null,
  });
  void createLog({ userId: inviter.id, action: "user_invited", details: { email: invitation.email } });
  return { email: invitation.email, expires_at: invitation.expiresAt, expires_in_days: INVITATION_TTL_DAYS };
});

// Irreversible; the UI handles the confirmation.
admin.post("/admin/users/:id/delete-all-prints", { access: "admin" }, async ({ params }) => ({
  ok: true,
  deleted: await deleteAllPrintsOfUser(params.id),
}));

admin.get("/admin/triggers/link-authors", { access: "admin" }, async () => ({
  ...(await authorLinkingSummary()),
  run: currentAuthorLinkingRun(),
}));

admin.post("/admin/triggers/link-authors", { access: "admin" }, ({ userId }) => {
  const run = startAuthorLinking(userId);
  if (!run) throw conflict("Linking is already running");
  return { run };
});

export const routers: Router[] = [admin.router];
