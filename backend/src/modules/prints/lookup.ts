import { prisma } from "../../db";
import { notFound } from "../../http/errors";
import type { CollectionRole, Print } from "../../generated/prisma/client";
import { printWriteWhere } from "./access";

/** The print, if `userId` owns it or holds at least `min` through a shared collection; 404 otherwise. */
export async function requireWritablePrint(userId: string, printId: string, min: CollectionRole): Promise<Print> {
  const print = await prisma.print.findFirst({ where: { id: printId, ...printWriteWhere(userId, min) } });
  if (!print) throw notFound("Print not found");
  return print;
}

/** The print, only if `userId` owns it (sharing, categories and author links never pass to collection editors). */
export async function requireOwnedPrint(userId: string, printId: string): Promise<Print> {
  const print = await prisma.print.findFirst({ where: { id: printId, userId } });
  if (!print) throw notFound("Print not found");
  return print;
}
