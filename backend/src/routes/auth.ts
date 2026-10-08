import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { issueToken, requireAuth } from "../auth";
import { prisma } from "../db";
import { HttpError } from "../utils/fileUtils";
import { parseBody } from "../utils/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { getAllowRegistrations, isSmtpConfigured } from "../services/settingsService";
import { sendPasswordResetEmail, sendVerificationEmail } from "../services/mailer";
import { findValidInvitation } from "../services/invitationService";
import { createLog } from "../services/auditLog";
import { seedDefaultCategories } from "../services/categoryService";
import { toUserOut } from "../dto";
import type { Prisma, Role } from "../generated/prisma/client";
import { rateLimit } from "../utils/rateLimit";

/** Brute-force guard for sign-in, sign-up and the e-mail/password flows. */
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });

const router = Router();

const PASSWORD_HASH_COST = 12;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
// Stops the forgot-password form from being used to flood someone's inbox.
const PASSWORD_RESET_RESEND_MS = 60 * 1000;

function newVerificationToken(): { token: string; expires: Date } {
  return { token: crypto.randomBytes(32).toString("hex"), expires: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS) };
}

const registerSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  invite_token: z.string().min(1).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string(),
});

router.post(
  "/register",
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(registerSchema, req.body);
    const email = body.email.toLowerCase();

    // The first account becomes admin and may always register, so the instance can be bootstrapped.
    const adminExists = (await prisma.user.count({ where: { role: "ADMIN" } })) > 0;
    const bootstrapping = !adminExists;

    // The token must match an unexpired invitation for this exact email.
    const invitation = body.invite_token ? await findValidInvitation(body.invite_token) : null;
    if (body.invite_token && !invitation) {
      throw new HttpError(400, "This invitation link is invalid or has expired. Ask for a new one.");
    }
    if (invitation && invitation.email !== email) {
      throw new HttpError(400, "This invitation is for a different email address.");
    }

    if (!bootstrapping && !invitation && !(await getAllowRegistrations(true))) {
      throw new HttpError(403, "Registration is currently disabled");
    }
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new HttpError(409, "An account with this email already exists");
    }

    const passwordHash = await bcrypt.hash(body.password, PASSWORD_HASH_COST);
    const role: Role = bootstrapping ? "ADMIN" : "MEMBER";
    // Verification only happens when SMTP is configured. The bootstrap admin and invitees (who
    // reached this via their own mailbox) skip it.
    const smtpConfigured = !bootstrapping && !invitation && (await isSmtpConfigured());
    const verification = smtpConfigured ? newVerificationToken() : null;

    const user = await prisma.$transaction(
      async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            passwordHash,
            displayName: body.displayName,
            role,
            emailVerified: !smtpConfigured,
            emailVerificationToken: verification?.token ?? null,
            emailVerificationExpires: verification?.expires ?? null,
          },
        });
        await seedDefaultCategories(tx, created.id);
        if (invitation) await tx.invitation.delete({ where: { id: invitation.id } });
        return created;
      },
      { timeout: 15000 },
    ); // ~80 sequential inserts; Prisma's 5s default is too tight

    if (smtpConfigured && verification) {
      try {
        await sendVerificationEmail(user.email, user.displayName, verification.token);
      } catch {
        await prisma.user.delete({ where: { id: user.id } });
        throw new HttpError(500, "Failed to send verification email. Please try again.");
      }
      res.json({ email_verification_required: true, email: user.email });
      return;
    }

    const { token, expiresIn } = await issueToken(user.id, user.role);
    res.json({ token, expires_in: expiresIn, user: toUserOut(user) });
  }),
);

router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(loginSchema, req.body);
    const email = body.email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    // Same message for unknown email and wrong password, to prevent enumeration.
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }

    if (user.disabledAt) {
      throw new HttpError(403, "This account has been disabled. Ask an administrator.", "ACCOUNT_DISABLED");
    }

    if (!user.emailVerified) {
      throw new HttpError(403, "Please verify your email before signing in.", "EMAIL_NOT_VERIFIED");
    }

    const { token, expiresIn } = await issueToken(user.id, user.role);
    res.json({ token, expires_in: expiresIn, user: toUserOut(user) });
    void prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => undefined);
    void createLog({ userId: user.id, action: "user_logged_in", details: { email: user.email } });
  }),
);

router.get(
  "/invitations/:token",
  asyncHandler(async (req, res) => {
    const invitation = await findValidInvitation(req.params.token);
    if (!invitation) throw new HttpError(404, "This invitation link is invalid or has expired. Ask for a new one.");
    res.json({ email: invitation.email, expires_at: invitation.expiresAt });
  }),
);

const verifyEmailSchema = z.object({ token: z.string().min(1) });

router.post(
  "/verify-email",
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(verifyEmailSchema, req.body);
    const user = await prisma.user.findUnique({ where: { emailVerificationToken: body.token } });
    if (!user || !user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
      throw new HttpError(400, "This verification link is invalid or has expired.");
    }

    let verified;
    if (user.pendingEmail) {
      // Someone may have registered this address since the change was requested.
      const conflict = await prisma.user.findUnique({ where: { email: user.pendingEmail } });
      if (conflict && conflict.id !== user.id) {
        throw new HttpError(409, "That email is now used by another account. Please request the change again.");
      }
      verified = await prisma.user.update({
        where: { id: user.id },
        data: {
          email: user.pendingEmail,
          pendingEmail: null,
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null,
        },
      });
    } else {
      verified = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null },
      });
    }
    // Verifying doubles as signing in.
    const { token, expiresIn } = await issueToken(verified.id, verified.role);
    res.json({ token, expires_in: expiresIn, user: toUserOut(verified) });
    void createLog({ userId: verified.id, action: "user_logged_in", details: { email: verified.email } });
  }),
);

const resendVerificationSchema = z.object({ email: z.string().trim().email() });

router.post(
  "/resend-verification",
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(resendVerificationSchema, req.body);
    const email = body.email.toLowerCase();
    // Same response in every case, to prevent enumeration.
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerified && (await isSmtpConfigured())) {
      const verification = newVerificationToken();
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerificationToken: verification.token, emailVerificationExpires: verification.expires },
      });
      try {
        await sendVerificationEmail(user.email, user.displayName, verification.token);
      } catch (err) {
        console.error("[auth] Failed to resend verification email:", err);
      }
    }
    res.json({ message: "If that account needs verification, we've sent a new email." });
  }),
);

const hashResetToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

async function findUserByResetToken(token: string) {
  const user = await prisma.user.findUnique({ where: { passwordResetTokenHash: hashResetToken(token) } });
  if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
    throw new HttpError(400, "This password reset link is invalid or has expired. Ask for a new one.");
  }
  return user;
}

const forgotPasswordSchema = z.object({ email: z.string().trim().email("Enter a valid email address") });

router.post(
  "/forgot-password",
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(forgotPasswordSchema, req.body);
    const email = body.email.toLowerCase();
    // Same response in every case, to prevent enumeration.
    const user = await prisma.user.findUnique({ where: { email } });
    const recentlySent =
      user?.passwordResetExpires &&
      user.passwordResetExpires.getTime() - PASSWORD_RESET_TTL_MS > Date.now() - PASSWORD_RESET_RESEND_MS;
    if (user && !recentlySent && (await isSmtpConfigured())) {
      const token = crypto.randomBytes(32).toString("hex");
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetTokenHash: hashResetToken(token),
          passwordResetExpires: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });
      try {
        await sendPasswordResetEmail(user.email, user.displayName, token);
        void createLog({ userId: user.id, action: "password_reset_requested", details: { email: user.email } });
      } catch (err) {
        console.error("[auth] Failed to send password reset email:", err);
      }
    }
    res.json({ message: "If an account uses that email, we've sent it a link to reset the password." });
  }),
);

// Lets the reset form say which account it's for, and fail before the user types a password.
router.get(
  "/reset-password/:token",
  asyncHandler(async (req, res) => {
    const user = await findUserByResetToken(req.params.token);
    res.json({ email: user.email });
  }),
);

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  new_password: z.string().min(8, "Password must be at least 8 characters"),
});

router.post(
  "/reset-password",
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(resetPasswordSchema, req.body);
    const user = await findUserByResetToken(body.token);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(body.new_password, PASSWORD_HASH_COST),
        passwordResetTokenHash: null,
        passwordResetExpires: null,
        // The link reached this mailbox, which is all verification proves.
        emailVerified: true,
      },
    });
    // Resetting doubles as signing in.
    const { token, expiresIn } = await issueToken(updated.id, updated.role);
    res.json({ token, expires_in: expiresIn, user: toUserOut(updated) });
    void createLog({ userId: updated.id, action: "password_reset", details: { email: updated.email } });
    void createLog({ userId: updated.id, action: "user_logged_in", details: { email: updated.email } });
  }),
);

const updateProfileSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required"),
    email: z.string().trim().email("Enter a valid email address").optional(),
    new_password: z.string().min(8, "Password must be at least 8 characters").optional(),
  })
  .refine((data) => data.email !== undefined || data.new_password !== undefined, { message: "Nothing to update" });

// Email changes wait in pendingEmail until verified, unless SMTP is unconfigured.
router.patch(
  "/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parseBody(updateProfileSchema, req.body);
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) throw new HttpError(401, "Invalid or expired token");
    if (!(await bcrypt.compare(body.current_password, user.passwordHash))) {
      // 403, not 401: the frontend treats any 401 as an expired session and logs out.
      throw new HttpError(403, "Current password is incorrect");
    }

    const data: Prisma.UserUpdateInput = {};
    let emailToVerify: string | null = null;
    let verification: { token: string; expires: Date } | null = null;

    if (body.email !== undefined) {
      const normalized = body.email.toLowerCase();
      if (normalized !== user.email) {
        const existing = await prisma.user.findUnique({ where: { email: normalized } });
        if (existing && existing.id !== user.id) {
          throw new HttpError(409, "An account with this email already exists");
        }
        if (await isSmtpConfigured()) {
          verification = newVerificationToken();
          data.pendingEmail = normalized;
          data.emailVerificationToken = verification.token;
          data.emailVerificationExpires = verification.expires;
          emailToVerify = normalized;
        } else {
          data.email = normalized;
          data.pendingEmail = null;
        }
      }
    }

    if (body.new_password !== undefined) {
      data.passwordHash = await bcrypt.hash(body.new_password, PASSWORD_HASH_COST);
    }

    if (Object.keys(data).length === 0) {
      res.json({ user: toUserOut(user) });
      return;
    }

    if (emailToVerify && verification) {
      try {
        await sendVerificationEmail(emailToVerify, user.displayName, verification.token);
      } catch {
        throw new HttpError(500, "Failed to send verification email. Please try again.");
      }
    }

    const updated = await prisma.user.update({ where: { id: user.id }, data });
    res.json({ user: toUserOut(updated) });
  }),
);

// JWTs are stateless; this only records the audit-log entry.
router.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ ok: true });
    void createLog({ userId: req.userId!, action: "user_logged_out" });
  }),
);

router.post(
  "/refresh",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) throw new HttpError(401, "Invalid or expired token");
    const { token, expiresIn } = await issueToken(user.id, user.role);
    res.json({ token, expires_in: expiresIn });
  }),
);

export default router;
