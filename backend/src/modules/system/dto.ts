import type { Notification } from "../../generated/prisma/client";

export type NotificationOut = {
  id: string;
  title: string;
  body: string | null;
  external_url: string | null;
  internal_path: string | null;
  read: boolean;
  created_at: string;
};

export function toNotificationOut(notification: Notification): NotificationOut {
  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    external_url: notification.externalUrl,
    internal_path: notification.internalPath,
    read: notification.readAt !== null,
    created_at: notification.createdAt.toISOString(),
  };
}
