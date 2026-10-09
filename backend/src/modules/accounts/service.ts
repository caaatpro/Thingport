import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { z } from "zod";
import { prisma } from "../../db";
import type { Prisma, Role } from "../../generated/prisma/client";
import { badRequest, conflict, forbidden, HttpError, notFound, unauthorized } from "../../http/errors";
import { logger } from "../../lib/logger";
import { createLog } from "../../services/auditLog";
import { seedDefaultCategories } from "../../services/categoryService";
import { getAllowRegistrations, isSmtpConfigured } from "../../services/settingsService";
import { toUserOut } from "./dto";
import { findValidInvitation } from "./invitations";
import { sendPasswordResetEmail, sendVerificationEmail } from "./mailer";
import type {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from "./schemas";
import { issueToken } from "./session";

const PASSWORD_HASH_COST = 12;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
// Stops the forgot-password form from being used to flood someone's inbox.
const PASSWORD_RESET_RESEND_MS = 60 * 1000;

function newVerificationToken(): { token: string; expires: Date } {
  return { token: crypto.randomBytes(32).toString("hex"), expires: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS) };
}

const hashResetToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

type User = Prisma.UserGetPayload<object>;

/** The response of every flow that signs the user in. */
async function signIn(user: User) {
  const { token, expiresIn } = await issueToken(user.id, user.role);
  return { token, expires_in: expiresIn, user: toUserOut(user) };
}

export async function register(body: z.output<typeof registerSchema>) {
  const email = body.email.toLowerCase();

  // The first account becomes admin and may always register, so the instance can be bootstrapped.
  const adminExists = (await prisma.user.count({ where: { role: "ADMIN" } })) > 0;
  const bootstrapping = !adminExists;

  // The token must match an unexpired invitation for this exact email.
  const invitation = body.invite_token ? await findValidInvitation(body.invite_token) : null;
  if (body.invite_token && !invitation) {
    throw badRequest("This invitation link is invalid or has expired. Ask for a new one.");
  }
  if (invitation && invitation.email !== email) {
    throw badRequest("This invitation is for a different email address.");
  }

  if (!bootstrapping && !invitation && !(await getAllowRegistrations(true))) {
    throw forbidden("Registration is currently disabled");
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    throw conflict("An account with this email already exists");
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
    return { email_verification_required: true, email: user.email };
  }
  return signIn(user);
}

export async function login(body: z.output<typeof loginSchema>) {
  const email = body.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  // Same message for unknown email and wrong password, to prevent enumeration.
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw unauthorized("Invalid email or password");
  }
  if (user.disabledAt) {
    throw forbidden("This account has been disabled. Ask an administrator.", "ACCOUNT_DISABLED");
  }
  if (!user.emailVerified) {
    throw forbidden("Please verify your email before signing in.", "EMAIL_NOT_VERIFIED");
  }

  const session = await signIn(user);
  void prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => undefined);
  void createLog({ userId: user.id, action: "user_logged_in", details: { email: user.email } });
  return session;
}

export async function describeInvitation(token: string) {
  const invitation = await findValidInvitation(token);
  if (!invitation) throw notFound("This invitation link is invalid or has expired. Ask for a new one.");
  return { email: invitation.email, expires_at: invitation.expiresAt };
}

export async function verifyEmail(body: z.output<typeof verifyEmailSchema>) {
  const user = await prisma.user.findUnique({ where: { emailVerificationToken: body.token } });
  if (!user || !user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
    throw badRequest("This verification link is invalid or has expired.");
  }

  let verified;
  if (user.pendingEmail) {
    // Someone may have registered this address since the change was requested.
    const taken = await prisma.user.findUnique({ where: { email: user.pendingEmail } });
    if (taken && taken.id !== user.id) {
      throw conflict("That email is now used by another account. Please request the change again.");
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
  const session = await signIn(verified);
  void createLog({ userId: verified.id, action: "user_logged_in", details: { email: verified.email } });
  return session;
}

export async function resendVerification(body: z.output<typeof resendVerificationSchema>) {
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
      logger.error("Failed to resend verification email", { error: err });
    }
  }
  return { message: "If that account needs verification, we've sent a new email." };
}

async function findUserByResetToken(token: string) {
  const user = await prisma.user.findUnique({ where: { passwordResetTokenHash: hashResetToken(token) } });
  if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
    throw badRequest("This password reset link is invalid or has expired. Ask for a new one.");
  }
  return user;
}

export async function forgotPassword(body: z.output<typeof forgotPasswordSchema>) {
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
      logger.error("Failed to send password reset email", { error: err });
    }
  }
  return { message: "If an account uses that email, we've sent it a link to reset the password." };
}

/** Lets the reset form say which account it's for, and fail before the user types a password. */
export async function describeResetToken(token: string) {
  const user = await findUserByResetToken(token);
  return { email: user.email };
}

export async function resetPassword(body: z.output<typeof resetPasswordSchema>) {
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
  const session = await signIn(updated);
  void createLog({ userId: updated.id, action: "password_reset", details: { email: updated.email } });
  void createLog({ userId: updated.id, action: "user_logged_in", details: { email: updated.email } });
  return session;
}

/** Email changes wait in pendingEmail until verified, unless SMTP is unconfigured. */
export async function updateProfile(userId: string, body: z.output<typeof updateProfileSchema>) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized("Invalid or expired token");
  if (!(await bcrypt.compare(body.current_password, user.passwordHash))) {
    // 403, not 401: the frontend treats any 401 as an expired session and logs out.
    throw forbidden("Current password is incorrect");
  }

  const data: Prisma.UserUpdateInput = {};
  let emailToVerify: string | null = null;
  let verification: { token: string; expires: Date } | null = null;

  if (body.email !== undefined) {
    const normalized = body.email.toLowerCase();
    if (normalized !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: normalized } });
      if (existing && existing.id !== user.id) {
        throw conflict("An account with this email already exists");
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

  if (Object.keys(data).length === 0) return { user: toUserOut(user) };

  if (emailToVerify && verification) {
    try {
      await sendVerificationEmail(emailToVerify, user.displayName, verification.token);
    } catch {
      throw new HttpError(500, "Failed to send verification email. Please try again.");
    }
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data });
  return { user: toUserOut(updated) };
}

/** JWTs are stateless; this only records the audit-log entry. */
export function logout(userId: string) {
  void createLog({ userId, action: "user_logged_out" });
  return { ok: true };
}

export async function refresh(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized("Invalid or expired token");
  const { token, expiresIn } = await issueToken(user.id, user.role);
  return { token, expires_in: expiresIn };
}

/**
 * Member directory for the sharing picker. Any signed-in member can look up who to share with; this
 * is a small single-instance team tool, so the roster (name + email) is intentionally visible to
 * members. No passwords or tokens are exposed.
 */
export async function listOtherUsers(userId: string) {
  const users = await prisma.user.findMany({
    where: { id: { not: userId } },
    select: { id: true, displayName: true, email: true },
    orderBy: { displayName: "asc" },
  });
  return users.map((u) => ({ id: u.id, display_name: u.displayName, email: u.email }));
}
