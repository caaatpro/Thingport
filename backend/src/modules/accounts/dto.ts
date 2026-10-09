import type { User } from "../../generated/prisma/client";

export type UserOut = {
  id: string;
  email: string;
  display_name: string;
  role: "ADMIN" | "MEMBER";
  pending_email: string | null;
  bio: string | null;
  background_url: string | null;
};

export function toUserOut(user: User): UserOut {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    role: user.role,
    pending_email: user.pendingEmail,
    bio: user.bio,
    background_url: user.backgroundUrl,
  };
}
