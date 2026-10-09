import type { LogEntry, UserWithPrintCount } from "./service";

export function toAdminUserOut(u: UserWithPrintCount) {
  return {
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
  };
}

export function toLogOut(l: LogEntry) {
  return {
    id: l.id,
    user_id: l.userId,
    user_display_name: l.userDisplayName,
    user_email: l.userEmail,
    action: l.action,
    target_id: l.targetId,
    details: l.details,
    created_at: l.createdAt,
  };
}
