import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../../db";
import { HttpError, conflict, notFound } from "../../http/errors";
import { invalidateSession } from "../accounts/index";
import { createLog } from "../system";
import { deleteAllPrintsForUser, otherActiveAdminCount } from "./service";

// User management for administrators. Every change is recorded in the audit log.

const PASSWORD_HASH_COST = 12;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

type Role = "ADMIN" | "MEMBER";

function generatePassword(): string {
  return crypto.randomBytes(12).toString("base64url");
}

async function loadTarget(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound("User not found");
  return user;
}

/** Stops an admin from locking everyone out: the last active admin can't be demoted, disabled or deleted. */
async function assertNotLastAdmin(target: { id: string; role: string }, what: string): Promise<void> {
  if (target.role === "ADMIN" && (await otherActiveAdminCount(target.id)) === 0) {
    throw new HttpError(400, `This is the only active administrator, so it can't be ${what}.`);
  }
}

export async function createUserAccount(
  actorId: string,
  input: { email: string; displayName: string; role: Role; password?: string },
) {
  const email = input.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw conflict("That email is already in use.");
  const password = input.password ?? generatePassword();
  const user = await prisma.user.create({
    data: {
      email,
      displayName: input.displayName,
      role: input.role,
      passwordHash: await bcrypt.hash(password, PASSWORD_HASH_COST),
      emailVerified: true,
    },
  });
  void createLog({
    userId: actorId,
    action: "user_created",
    targetId: user.id,
    details: { email: user.email, role: user.role },
  });
  return { id: user.id, email: user.email, generated_password: input.password ? null : password };
}

export async function updateUserAccount(
  actorId: string,
  targetId: string,
  patch: { displayName?: string; role?: Role; disabled?: boolean },
): Promise<void> {
  const target = await loadTarget(targetId);
  const self = target.id === actorId;
  const data: {
    displayName?: string;
    role?: Role;
    disabledAt?: Date | null;
    sessionVersion?: { increment: number };
  } = {};

  if (patch.displayName !== undefined) data.displayName = patch.displayName;
  if (patch.role !== undefined && patch.role !== target.role) {
    if (self) throw new HttpError(400, "You can't change your own role.");
    if (patch.role === "MEMBER") await assertNotLastAdmin(target, "demoted");
    data.role = patch.role;
  }
  if (patch.disabled !== undefined && patch.disabled !== (target.disabledAt !== null)) {
    if (patch.disabled) {
      if (self) throw new HttpError(400, "You can't disable your own account.");
      await assertNotLastAdmin(target, "disabled");
      data.disabledAt = new Date();
      data.sessionVersion = { increment: 1 };
    } else {
      data.disabledAt = null;
    }
  }
  if (Object.keys(data).length === 0) return;

  const updated = await prisma.user.update({ where: { id: target.id }, data });
  invalidateSession(target.id);
  if (data.role) {
    void createLog({
      userId: actorId,
      action: "user_role_changed",
      targetId: target.id,
      details: { email: target.email, from: target.role, to: updated.role },
    });
  }
  if (data.disabledAt !== undefined) {
    void createLog({
      userId: actorId,
      action: data.disabledAt ? "user_disabled" : "user_enabled",
      targetId: target.id,
      details: { email: target.email },
    });
  }
  if (data.displayName !== undefined) {
    void createLog({ userId: actorId, action: "user_updated", targetId: target.id, details: { email: target.email } });
  }
}

/** Ends every browser session of the user; with `revokeTokens` also the Thingport Grab tokens. */
export async function signOutUser(actorId: string, targetId: string, revokeTokens: boolean): Promise<number> {
  const target = await loadTarget(targetId);
  await prisma.user.update({ where: { id: target.id }, data: { sessionVersion: { increment: 1 } } });
  invalidateSession(target.id);
  let revoked = 0;
  if (revokeTokens) revoked = (await prisma.apiToken.deleteMany({ where: { userId: target.id } })).count;
  void createLog({
    userId: actorId,
    action: "user_signed_out",
    targetId: target.id,
    details: { email: target.email, revoked_tokens: revoked },
  });
  return revoked;
}

/** A one-hour, single-use reset token for instances without outgoing email; the caller builds the link. */
export async function createPasswordResetToken(
  actorId: string,
  targetId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const target = await loadTarget(targetId);
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  await prisma.user.update({
    where: { id: target.id },
    data: {
      passwordResetTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      passwordResetExpires: expiresAt,
    },
  });
  void createLog({
    userId: actorId,
    action: "password_reset_link_created",
    targetId: target.id,
    details: { email: target.email },
  });
  return { token, expiresAt };
}

/** Removes the account and every model, collection and file it owned. Irreversible. */
export async function deleteUserAccount(actorId: string, targetId: string): Promise<number> {
  const target = await loadTarget(targetId);
  if (target.id === actorId) throw new HttpError(400, "You can't delete your own account.");
  await assertNotLastAdmin(target, "deleted");
  const deletedModels = await deleteAllPrintsForUser(target.id);
  await prisma.user.delete({ where: { id: target.id } });
  invalidateSession(target.id);
  void createLog({
    userId: actorId,
    action: "user_deleted",
    details: { email: target.email, display_name: target.displayName, deleted_models: deletedModels },
  });
  return deletedModels;
}

export async function deleteAllPrintsOfUser(targetId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: targetId } });
  if (!user) throw notFound("User not found");
  return deleteAllPrintsForUser(user.id);
}
