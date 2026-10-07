import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { prisma } from "../db";
import { requireAdmin, requireAuth } from "../auth";
import { HttpError } from "../utils/fileUtils";
import { asyncHandler } from "../utils/asyncHandler";
import { z } from "zod";
import { parseBody } from "../utils/validate";
import { invalidateSession } from "../auth";
import { PUBLIC_URL } from "../config";
import {
  deleteAllPrintsForUser,
  getAdminOverview,
  getStorageUsage,
  listLogs,
  listUsersWithPrintCounts,
  otherActiveAdminCount,
} from "../services/adminService";
import { enqueuePlate } from "../services/processingQueue";
import { createLog } from "../services/auditLog";
import { INVITATION_TTL_DAYS, inviteUser } from "../services/invitationService";
import { authorLinkingSummary, currentAuthorLinkingRun, startAuthorLinking } from "../services/authorLinkingService";

const router = Router();
router.use(requireAuth);
router.use(requireAdmin);

router.get(
  "/admin/users",
  asyncHandler(async (_req, res) => {
    const users = await listUsersWithPrintCounts();
    res.json(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        display_name: u.displayName,
        role: u.role,
        print_count: u.printCount,
        collection_count: u.collectionCount,
        storage_bytes: u.storageBytes,
        api_token_count: u.apiTokenCount,
        makerworld_connected: u.makerworldConnected,
        email_verified: u.emailVerified,
        disabled: u.disabledAt !== null,
        last_login_at: u.lastLoginAt,
        created_at: u.createdAt,
      })),
    );
  }),
);

router.get(
  "/admin/overview",
  asyncHandler(async (_req, res) => {
    res.json(await getAdminOverview());
  }),
);

const PASSWORD_HASH_COST = 12;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

function generatePassword(): string {
  return crypto.randomBytes(12).toString("base64url");
}

async function loadTarget(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, "User not found");
  return user;
}

/** Stops an admin from locking everyone out: the last active admin can't be demoted, disabled or deleted. */
async function assertNotLastAdmin(target: { id: string; role: string }, what: string): Promise<void> {
  if (target.role === "ADMIN" && (await otherActiveAdminCount(target.id)) === 0) {
    throw new HttpError(400, `This is the only active administrator, so it can't be ${what}.`);
  }
}

const createUserSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  display_name: z.string().trim().min(1, "Enter a name").max(80),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
  // Optional: a strong one is generated (and shown once) when omitted.
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
});
router.post(
  "/admin/users",
  asyncHandler(async (req, res) => {
    const body = parseBody(createUserSchema, req.body);
    const email = body.email.toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(409, "That email is already in use.");
    const password = body.password ?? generatePassword();
    const user = await prisma.user.create({
      data: {
        email,
        displayName: body.display_name,
        role: body.role,
        passwordHash: await bcrypt.hash(password, PASSWORD_HASH_COST),
        emailVerified: true,
      },
    });
    void createLog({
      userId: req.userId!,
      action: "user_created",
      targetId: user.id,
      details: { email: user.email, role: user.role },
    });
    res.status(201).json({ id: user.id, email: user.email, generated_password: body.password ? null : password });
  }),
);

const updateUserSchema = z
  .object({
    display_name: z.string().trim().min(1).max(80),
    role: z.enum(["ADMIN", "MEMBER"]),
    disabled: z.boolean(),
  })
  .partial();
router.patch(
  "/admin/users/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(updateUserSchema, req.body);
    const target = await loadTarget(req.params.id);
    const self = target.id === req.userId;
    const data: {
      displayName?: string;
      role?: "ADMIN" | "MEMBER";
      disabledAt?: Date | null;
      sessionVersion?: { increment: number };
    } = {};

    if (body.display_name !== undefined) data.displayName = body.display_name;
    if (body.role !== undefined && body.role !== target.role) {
      if (self) throw new HttpError(400, "You can't change your own role.");
      if (body.role === "MEMBER") await assertNotLastAdmin(target, "demoted");
      data.role = body.role;
    }
    if (body.disabled !== undefined && body.disabled !== (target.disabledAt !== null)) {
      if (body.disabled) {
        if (self) throw new HttpError(400, "You can't disable your own account.");
        await assertNotLastAdmin(target, "disabled");
        data.disabledAt = new Date();
        data.sessionVersion = { increment: 1 };
      } else {
        data.disabledAt = null;
      }
    }
    if (Object.keys(data).length === 0) {
      res.json({ ok: true });
      return;
    }
    const updated = await prisma.user.update({ where: { id: target.id }, data });
    invalidateSession(target.id);
    if (data.role) {
      void createLog({
        userId: req.userId!,
        action: "user_role_changed",
        targetId: target.id,
        details: { email: target.email, from: target.role, to: updated.role },
      });
    }
    if (data.disabledAt !== undefined) {
      void createLog({
        userId: req.userId!,
        action: data.disabledAt ? "user_disabled" : "user_enabled",
        targetId: target.id,
        details: { email: target.email },
      });
    }
    if (data.displayName !== undefined) {
      void createLog({
        userId: req.userId!,
        action: "user_updated",
        targetId: target.id,
        details: { email: target.email },
      });
    }
    res.json({ ok: true });
  }),
);

// Ends every browser session of the user; with revoke_tokens also the Thingport Grab tokens.
const signOutSchema = z.object({ revoke_tokens: z.boolean().default(false) });
router.post(
  "/admin/users/:id/sign-out",
  asyncHandler(async (req, res) => {
    const body = parseBody(signOutSchema, req.body ?? {});
    const target = await loadTarget(req.params.id);
    await prisma.user.update({ where: { id: target.id }, data: { sessionVersion: { increment: 1 } } });
    invalidateSession(target.id);
    let revoked = 0;
    if (body.revoke_tokens) revoked = (await prisma.apiToken.deleteMany({ where: { userId: target.id } })).count;
    void createLog({
      userId: req.userId!,
      action: "user_signed_out",
      targetId: target.id,
      details: { email: target.email, revoked_tokens: revoked },
    });
    res.json({ ok: true, revoked_tokens: revoked });
  }),
);

// A one-hour, single-use link the admin passes on, for instances without outgoing email.
router.post(
  "/admin/users/:id/reset-link",
  asyncHandler(async (req, res) => {
    const target = await loadTarget(req.params.id);
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await prisma.user.update({
      where: { id: target.id },
      data: {
        passwordResetTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
        passwordResetExpires: expiresAt,
      },
    });
    const base = PUBLIC_URL || (req.get("origin") ?? "").replace(/\/+$/, "");
    void createLog({
      userId: req.userId!,
      action: "password_reset_link_created",
      targetId: target.id,
      details: { email: target.email },
    });
    res.json({ url: `${base}/reset-password?token=${encodeURIComponent(token)}`, expires_at: expiresAt });
  }),
);

// Removes the account and every model, collection and file it owned. Irreversible; the UI confirms.
router.delete(
  "/admin/users/:id",
  asyncHandler(async (req, res) => {
    const target = await loadTarget(req.params.id);
    if (target.id === req.userId) throw new HttpError(400, "You can't delete your own account.");
    await assertNotLastAdmin(target, "deleted");
    const deletedModels = await deleteAllPrintsForUser(target.id);
    await prisma.user.delete({ where: { id: target.id } });
    invalidateSession(target.id);
    void createLog({
      userId: req.userId!,
      action: "user_deleted",
      details: { email: target.email, display_name: target.displayName, deleted_models: deletedModels },
    });
    res.json({ ok: true, deleted_models: deletedModels });
  }),
);

// Plates whose background processing failed (thumbnail, geometry) get another go.
router.post(
  "/admin/processing/retry-failed",
  asyncHandler(async (req, res) => {
    const failed = await prisma.plate.findMany({ where: { processingStatus: "FAILED" }, select: { id: true } });
    for (const { id } of failed) await enqueuePlate(id);
    void createLog({ userId: req.userId!, action: "processing_retried", details: { plates: failed.length } });
    res.json({ ok: true, retried: failed.length });
  }),
);

router.get(
  "/admin/storage",
  asyncHandler(async (_req, res) => {
    const usage = await getStorageUsage();
    res.json({ model_bytes: usage.modelBytes, model_count: usage.modelCount });
  }),
);

function parseDateParam(raw: unknown): Date | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new HttpError(400, "Invalid date");
  return parsed;
}

router.get(
  "/admin/logs",
  asyncHandler(async (req, res) => {
    const userId = typeof req.query.user_id === "string" && req.query.user_id ? req.query.user_id : undefined;
    const from = parseDateParam(req.query.from);
    const to = parseDateParam(req.query.to);
    const logs = await listLogs({ userId, from, to });
    res.json(
      logs.map((l) => ({
        id: l.id,
        user_id: l.userId,
        user_display_name: l.userDisplayName,
        user_email: l.userEmail,
        action: l.action,
        target_id: l.targetId,
        details: l.details,
        created_at: l.createdAt,
      })),
    );
  }),
);

// Re-inviting an address sends a fresh link and retires the old one.
const inviteSchema = z.object({ email: z.string().trim().email("Enter a valid email address") });
router.post(
  "/admin/invitations",
  asyncHandler(async (req, res) => {
    const body = parseBody(inviteSchema, req.body);
    const admin = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!admin) throw new HttpError(401, "Invalid or expired token");
    const invitation = await inviteUser({
      email: body.email,
      invitedById: admin.id,
      inviterName: admin.displayName,
      origin: req.get("origin") ?? null,
    });
    void createLog({ userId: admin.id, action: "user_invited", details: { email: invitation.email } });
    res.json({ email: invitation.email, expires_at: invitation.expiresAt, expires_in_days: INVITATION_TTL_DAYS });
  }),
);

// Irreversible; the UI handles the confirmation.
router.post(
  "/admin/users/:id/delete-all-prints",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new HttpError(404, "User not found");
    const deleted = await deleteAllPrintsForUser(user.id);
    res.json({ ok: true, deleted });
  }),
);

router.get(
  "/admin/triggers/link-authors",
  asyncHandler(async (_req, res) => {
    res.json({ ...(await authorLinkingSummary()), run: currentAuthorLinkingRun() });
  }),
);

router.post(
  "/admin/triggers/link-authors",
  asyncHandler(async (req, res) => {
    const run = startAuthorLinking(req.userId!);
    if (!run) throw new HttpError(409, "Linking is already running");
    res.json({ run });
  }),
);

export default router;
