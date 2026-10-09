import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../db";

/**
 * Gives `ids` the positions 0..n-1 in that order. (printId, position) is unique, so a straight rewrite could
 * collide with rows that haven't moved yet: park everything on negative positions first.
 */
export async function renumberInTwoPhases(
  setPosition: (id: string, position: number) => Prisma.PrismaPromise<unknown>,
  ids: string[],
): Promise<void> {
  await prisma.$transaction(ids.map((id, idx) => setPosition(id, -(idx + 1))));
  await prisma.$transaction(ids.map((id, idx) => setPosition(id, idx)));
}
