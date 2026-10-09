import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../db";
import { logger } from "../../lib/logger";

export type LogAction =
  | "user_logged_in"
  | "user_logged_out"
  | "password_reset_requested"
  | "password_reset"
  | "user_invited"
  | "user_created"
  | "user_updated"
  | "user_role_changed"
  | "user_disabled"
  | "user_enabled"
  | "user_deleted"
  | "user_signed_out"
  | "password_reset_link_created"
  | "processing_retried"
  | "authors_linked"
  | "model_uploaded"
  | "model_imported"
  | "import_completed"
  | "model_edited"
  | "model_deleted"
  | "token_created"
  | "token_revoked"
  | "model_shared"
  | "collection_shared"
  | "collection_created"
  | "collection_edited"
  | "collection_deleted"
  | "collection_item_added"
  | "collection_item_removed";

/** Fire-and-forget: a logging failure must never break the action it records. */
export async function createLog(params: {
  userId: string;
  action: LogAction;
  targetId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.log.create({
      data: {
        userId: params.userId,
        action: params.action,
        targetId: params.targetId ?? null,
        details: (params.details ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.error("Failed to write audit log entry", { error: err, action: params.action });
  }
}
