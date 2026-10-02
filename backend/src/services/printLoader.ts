import { prisma } from "../db";
import { HttpError } from "../utils/fileUtils";
import { toPrintOut, type PrintOut } from "../dto";
import { printReadWhere } from "./access";
import type { Author, Category, Plate, PreviewImage, Print, PrintFile } from "@prisma/client";

type OwnerSel = { id: string; displayName: string };
type ShareSel = { sharedWithUserId: string };

export type FullPrint = {
  print: Print & { author: Author | null; category: Category | null; user: OwnerSel; shares: ShareSel[] };
  plates: Plate[];
  files: PrintFile[];
  preparedFile: PrintFile | null;
  previewImages: PreviewImage[];
};

// loadFullPrint authorizes READ access (owner OR shared-with-me). Callers that mutate still guard
// ownership themselves before refreshing their response through here.
export async function loadFullPrint(userId: string, printId: string): Promise<FullPrint> {
  const print = await prisma.print.findFirst({
    where: { id: printId, ...printReadWhere(userId) },
    include: {
      author: true,
      category: true,
      user: { select: { id: true, displayName: true } },
      shares: { select: { sharedWithUserId: true } },
    },
  });
  if (!print) throw new HttpError(404, "Print not found");
  const [plates, files, previewImages] = await Promise.all([
    prisma.plate.findMany({ where: { printId }, orderBy: { position: "asc" } }),
    prisma.printFile.findMany({ where: { printId } }),
    prisma.previewImage.findMany({ where: { printId }, orderBy: { position: "asc" } }),
  ]);
  const preparedFile = print.preparedFileId
    ? await prisma.printFile.findUnique({ where: { id: print.preparedFileId } })
    : null;
  return { print, plates, files, preparedFile, previewImages };
}

export async function printOutById(userId: string, printId: string): Promise<PrintOut> {
  const full = await loadFullPrint(userId, printId);
  return toPrintOut(
    full.print,
    full.plates,
    full.files,
    full.preparedFile,
    full.print.author,
    full.previewImages,
    full.print.category,
    { viewerId: userId, shares: full.print.shares, owner: { id: full.print.user.id, display_name: full.print.user.displayName } },
  );
}

function groupByPrintId<T extends { printId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.printId);
    if (list) list.push(row);
    else map.set(row.printId, [row]);
  }
  return map;
}

/** A few `IN` queries instead of one load per id. Ids not owned by `userId` are omitted. */
export async function printOutsByIds(userId: string, printIds: string[]): Promise<Map<string, PrintOut>> {
  const out = new Map<string, PrintOut>();
  if (!printIds.length) return out;
  const [prints, plates, files, previewImages] = await Promise.all([
    prisma.print.findMany({
      where: { id: { in: printIds }, ...printReadWhere(userId) },
      include: {
        author: true,
        user: { select: { id: true, displayName: true } },
        shares: { select: { sharedWithUserId: true } },
      },
    }),
    prisma.plate.findMany({ where: { printId: { in: printIds } }, orderBy: { position: "asc" } }),
    prisma.printFile.findMany({ where: { printId: { in: printIds } } }),
    prisma.previewImage.findMany({ where: { printId: { in: printIds } }, orderBy: { position: "asc" } }),
  ]);
  const platesByPrint = groupByPrintId(plates);
  const filesByPrint = groupByPrintId(files);
  const previewsByPrint = groupByPrintId(previewImages);
  for (const print of prints) {
    const printFiles = filesByPrint.get(print.id) || [];
    const preparedFile = print.preparedFileId ? (printFiles.find((f) => f.id === print.preparedFileId) ?? null) : null;
    out.set(
      print.id,
      toPrintOut(
        print,
        platesByPrint.get(print.id) || [],
        printFiles,
        preparedFile,
        print.author,
        previewsByPrint.get(print.id) || [],
        undefined,
        { viewerId: userId, shares: print.shares, owner: { id: print.user.id, display_name: print.user.displayName } },
      ),
    );
  }
  return out;
}
