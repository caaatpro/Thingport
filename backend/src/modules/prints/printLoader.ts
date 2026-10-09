import { prisma } from "../../db";
import { notFound } from "../../http/errors";
import type {
  Author,
  Category,
  CollectionRole,
  Plate,
  PreviewImage,
  Print,
  PrintFile,
} from "../../generated/prisma/client";
import { printReadWhere, sharedViaCollectionSelect, viewerRolesByPrint } from "./access";
import { toPrintOut, type PrintOut } from "./dto";

type OwnerSel = { id: string; displayName: string };
type ShareSel = { sharedWithUserId: string };

/** A print row with the relations every API response about it needs (see `printRowInclude`). */
export type PrintRow = Print & {
  author: Author | null;
  user: OwnerSel;
  shares: ShareSel[];
  collectionItems: { id: string }[];
};

/** The relations that ride along with a print row; plates, files and images are loaded separately. */
export const printRowInclude = {
  author: true,
  user: { select: { id: true, displayName: true } },
  shares: { select: { sharedWithUserId: true } },
  collectionItems: sharedViaCollectionSelect,
} as const;

export type FullPrint = {
  print: PrintRow & { category: Category | null };
  plates: Plate[];
  files: PrintFile[];
  preparedFile: PrintFile | null;
  previewImages: PreviewImage[];
  viewerRole: CollectionRole | null;
};

type PrintParts = {
  plates: Plate[];
  files: PrintFile[];
  previewImages: PreviewImage[];
  /** The viewer's role through a shared collection; absent for models they own. */
  viewerRole?: CollectionRole | null;
  category?: Category | null;
};

/** The one place a print row plus its parts becomes the API shape, as seen by `viewerId`. */
export function printOutFromParts(viewerId: string, print: PrintRow, parts: PrintParts): PrintOut {
  const preparedFile = print.preparedFileId ? (parts.files.find((f) => f.id === print.preparedFileId) ?? null) : null;
  return toPrintOut(print, parts.plates, parts.files, preparedFile, print.author, parts.previewImages, parts.category, {
    viewerId,
    viewerRole: parts.viewerRole,
    shares: print.shares,
    viaCollection: print.collectionItems.length > 0,
    owner: { id: print.user.id, display_name: print.user.displayName },
  });
}

// loadFullPrint authorizes READ access (owner OR shared-with-me). Callers that mutate still guard
// ownership themselves before refreshing their response through here.
export async function loadFullPrint(userId: string, printId: string): Promise<FullPrint> {
  const print = await prisma.print.findFirst({
    where: { id: printId, ...printReadWhere(userId) },
    include: { ...printRowInclude, category: true },
  });
  if (!print) throw notFound("Print not found");
  const [plates, files, previewImages] = await Promise.all([
    prisma.plate.findMany({ where: { printId }, orderBy: { position: "asc" } }),
    prisma.printFile.findMany({ where: { printId } }),
    prisma.previewImage.findMany({ where: { printId }, orderBy: { position: "asc" } }),
  ]);
  const preparedFile = print.preparedFileId ? (files.find((f) => f.id === print.preparedFileId) ?? null) : null;
  const viewerRole =
    print.userId === userId ? null : ((await viewerRolesByPrint(userId, [printId])).get(printId) ?? null);
  return { print, plates, files, preparedFile, previewImages, viewerRole };
}

export async function printOutById(userId: string, printId: string): Promise<PrintOut> {
  const full = await loadFullPrint(userId, printId);
  return printOutFromParts(userId, full.print, {
    plates: full.plates,
    files: full.files,
    previewImages: full.previewImages,
    viewerRole: full.viewerRole,
    category: full.print.category,
  });
}

export function groupByPrintId<T extends { printId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.printId);
    if (list) list.push(row);
    else map.set(row.printId, [row]);
  }
  return map;
}

/** A few `IN` queries instead of one load per id. Ids the user can't read are omitted. */
export async function printOutsByIds(userId: string, printIds: string[]): Promise<Map<string, PrintOut>> {
  const out = new Map<string, PrintOut>();
  if (!printIds.length) return out;
  const [prints, plates, files, previewImages] = await Promise.all([
    prisma.print.findMany({
      where: { id: { in: printIds }, ...printReadWhere(userId) },
      include: printRowInclude,
    }),
    prisma.plate.findMany({ where: { printId: { in: printIds } }, orderBy: { position: "asc" } }),
    prisma.printFile.findMany({ where: { printId: { in: printIds } } }),
    prisma.previewImage.findMany({ where: { printId: { in: printIds } }, orderBy: { position: "asc" } }),
  ]);
  const rolesByPrint = await viewerRolesByPrint(userId, printIds);
  const platesByPrint = groupByPrintId(plates);
  const filesByPrint = groupByPrintId(files);
  const previewsByPrint = groupByPrintId(previewImages);
  for (const print of prints) {
    out.set(
      print.id,
      printOutFromParts(userId, print, {
        plates: platesByPrint.get(print.id) ?? [],
        files: filesByPrint.get(print.id) ?? [],
        previewImages: previewsByPrint.get(print.id) ?? [],
        viewerRole: rolesByPrint.get(print.id),
      }),
    );
  }
  return out;
}
