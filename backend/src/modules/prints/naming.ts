import path from "node:path";
import { conflict } from "../../http/errors";
import { prisma } from "../../db";
import { sanitizePathSegment } from "./storage";

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Throws 409 if `requested` is already taken in this category (for this user). Used for
 * explicit renames. */
export async function uniqueModelName(
  userId: string,
  requested: string,
  categoryId: string | null,
  excludeId?: string,
): Promise<string> {
  const base = sanitizePathSegment(requested, "Model");
  const existing = await prisma.print.findFirst({
    where: {
      userId,
      categoryId: categoryId ?? null,
      nameNormalized: normalizeName(base),
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (existing) throw conflict(`A print named "${base}" already exists in this category`);
  return base;
}

/** Auto-suffixes `requested` until it's free in this category (for this user). Used for
 * creation/reassignment. */
export async function availableModelName(
  userId: string,
  requested: string,
  categoryId: string | null,
  excludeId?: string,
): Promise<string> {
  const base = sanitizePathSegment(requested, "Model");
  let candidate = base;
  let suffix = 2;
  // Small categories in practice; a loop of sequential existence checks is simple and correct.
  for (;;) {
    const existing = await prisma.print.findFirst({
      where: {
        userId,
        categoryId: categoryId ?? null,
        nameNormalized: normalizeName(candidate),
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (!existing) return candidate;
    candidate = `${base} (${suffix})`;
    suffix += 1;
  }
}

/** Auto-suffixes a plate's filename until it's unique among its print's other plates. */
export async function availablePlateFilename(
  printId: string,
  desiredFilename: string,
  excludePlateId?: string,
): Promise<string> {
  const siblings = await prisma.plate.findMany({
    where: { printId, ...(excludePlateId ? { id: { not: excludePlateId } } : {}) },
    select: { filename: true },
  });
  const taken = new Set(siblings.map((p) => p.filename.toLowerCase()));
  if (!taken.has(desiredFilename.toLowerCase())) return desiredFilename;
  const ext = path.extname(desiredFilename);
  const stem = path.basename(desiredFilename, ext);
  let suffix = 2;
  for (;;) {
    const candidate = `${stem} (${suffix})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
    suffix += 1;
  }
}
