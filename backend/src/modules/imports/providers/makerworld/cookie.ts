import { prisma } from "../../../../db";

/** Per-user, unlike the instance-wide Thingiverse token: MakerWorld imports run as the user's own
 * login. */
export async function getUserMakerworldCookie(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { makerworldCookie: true } });
  return user?.makerworldCookie ?? null;
}

export async function setUserMakerworldCookie(userId: string, cookie: string | null): Promise<boolean> {
  const trimmed = (cookie ?? "").trim();
  await prisma.user.update({ where: { id: userId }, data: { makerworldCookie: trimmed || null } });
  return Boolean(trimmed);
}
