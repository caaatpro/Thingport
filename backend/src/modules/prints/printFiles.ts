import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { prisma } from "../../db";
import { STORAGE, IMPORT_MAX_BYTES } from "../../config";
import { badRequest, notFound, payloadTooLarge } from "../../http/errors";
import { sanitizeFilename, mimeFromContentType } from "../../lib/files";
import { isPreparedPrintFilename, inspectPreparedPrint } from "../processing/index";
import type { Prisma, Print, PrintFile } from "../../generated/prisma/client";
import { printReadWhere } from "./access";
import { moveFile, pruneEmptyDirs } from "./files";

export function managedPrintFilePath(printFile: Pick<PrintFile, "storagePath">): string {
  const candidate = path.resolve(STORAGE, printFile.storagePath);
  const root = path.resolve(STORAGE);
  if (candidate === root || !candidate.startsWith(root + path.sep)) {
    throw badRequest("Related file resolved outside storage");
  }
  return candidate;
}

export async function listSupportingFiles(printId: string): Promise<PrintFile[]> {
  return prisma.printFile.findMany({
    where: { printId, role: "SUPPORTING" },
    orderBy: [{ filename: "asc" }, { id: "asc" }],
  });
}

function pruneBundleDirs(start: string): Promise<void> {
  return pruneEmptyDirs(start, path.join(STORAGE, "bundles"));
}

/** The supporting files of a print the user may read, by name. */
export async function listReadableSupportingFiles(userId: string, printId: string): Promise<PrintFile[]> {
  const print = await prisma.print.findFirst({ where: { id: printId, ...printReadWhere(userId) } });
  if (!print) throw notFound("Print not found");
  return listSupportingFiles(print.id);
}

export type StoredFile = { record: PrintFile; filePath: string };

async function storedFileOf(record: PrintFile | null, printId: string, role: PrintFile["role"]): Promise<StoredFile> {
  if (!record || record.printId !== printId || record.role !== role) throw notFound();
  const filePath = managedPrintFilePath(record);
  if (!fsSync.existsSync(filePath)) throw notFound();
  return { record, filePath };
}

/** A supporting file of a print the user may read, with where it lives on disk; 404 when any link is missing. */
export async function readableSupportingFile(userId: string, printId: string, fileId: string): Promise<StoredFile> {
  const print = await prisma.print.findFirst({ where: { id: printId, ...printReadWhere(userId) } });
  if (!print) throw notFound();
  return storedFileOf(await prisma.printFile.findUnique({ where: { id: fileId } }), print.id, "SUPPORTING");
}

/** The prepared (sliced) file of a print the user may read; 404 when there is none. */
export async function readablePreparedFile(userId: string, printId: string): Promise<StoredFile> {
  const print = await prisma.print.findFirst({ where: { id: printId, ...printReadWhere(userId) } });
  if (!print?.preparedFileId) throw notFound();
  return storedFileOf(await prisma.printFile.findUnique({ where: { id: print.preparedFileId } }), print.id, "PREPARED");
}

/**
 * Saves an uploaded file onto a print. The role comes from the filename (a .3mf containing
 * gcode becomes PREPARED); a new PREPARED file replaces the existing one.
 */
export async function saveFileFromTemp(
  userId: string,
  printId: string,
  tempPath: string,
  originalFilename: string,
  contentType: string | null | undefined,
): Promise<Print> {
  const print = await prisma.print.findFirst({ where: { id: printId, userId } });
  if (!print) throw notFound("Print not found");

  const safeName = sanitizeFilename(originalFilename || "supporting-file");
  let role: "SUPPORTING" | "PREPARED" = isPreparedPrintFilename(safeName) ? "PREPARED" : "SUPPORTING";
  const mime = mimeFromContentType(contentType, safeName);

  const record = await prisma.printFile.create({
    data: {
      printId: print.id,
      filename: safeName,
      mime,
      role,
      storagePath: "pending",
    },
  });
  const storagePath = `bundles/${print.id}/${record.id}/${safeName}`;
  const destination = path.join(STORAGE, storagePath);

  try {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const stat = await fs.stat(tempPath);
    if (stat.size > IMPORT_MAX_BYTES) throw payloadTooLarge("Related file exceeds size limit");
    await moveFile(tempPath, destination);

    let metadata: Record<string, unknown> | null = null;
    if (role === "PREPARED" || safeName.toLowerCase().endsWith(".3mf")) {
      metadata = (await inspectPreparedPrint(destination, safeName)) as Record<string, unknown> | null;
    }
    if (metadata) role = "PREPARED";

    let oldPreparedPath: string | null = null;
    let oldPreparedId: string | null = null;
    const updatedPrint = await prisma.$transaction(async (tx) => {
      const currentPrint = await tx.print.findUnique({ where: { id: printId } });
      if (!currentPrint) throw notFound("Print not found");
      await tx.printFile.update({
        where: { id: record.id },
        data: {
          storagePath,
          size: stat.size,
          role,
          metadata: (metadata as Prisma.InputJsonValue | undefined) ?? undefined,
        },
      });
      if (role === "PREPARED") {
        if (currentPrint.preparedFileId && currentPrint.preparedFileId !== record.id) {
          const old = await tx.printFile.findUnique({ where: { id: currentPrint.preparedFileId } });
          if (old) {
            oldPreparedPath = managedPrintFilePath(old);
            oldPreparedId = old.id;
          }
        }
        await tx.print.update({ where: { id: printId }, data: { preparedFileId: record.id } });
        if (oldPreparedId) {
          await tx.printFile.delete({ where: { id: oldPreparedId } });
        }
      }
      return tx.print.findUniqueOrThrow({ where: { id: printId } });
    });

    if (oldPreparedPath) {
      await fs.rm(oldPreparedPath, { force: true }).catch(() => undefined);
      await pruneBundleDirs(path.dirname(oldPreparedPath));
    }
    return updatedPrint;
  } catch (err) {
    await fs.rm(destination, { force: true }).catch(() => undefined);
    await pruneBundleDirs(path.dirname(destination));
    await prisma.printFile.delete({ where: { id: record.id } }).catch(() => undefined);
    throw err;
  }
}

export async function deleteSupportingFile(userId: string, printId: string, fileId: string): Promise<Print> {
  const print = await prisma.print.findFirst({ where: { id: printId, userId } });
  if (!print) throw notFound("Print not found");
  const record = await prisma.printFile.findUnique({ where: { id: fileId } });
  if (!record || record.printId !== printId || record.role !== "SUPPORTING") {
    throw notFound("Supporting file not found");
  }
  const filePath = managedPrintFilePath(record);
  await prisma.printFile.delete({ where: { id: fileId } });
  await fs.rm(filePath, { force: true }).catch(() => undefined);
  await pruneBundleDirs(path.dirname(filePath));
  return prisma.print.findUniqueOrThrow({ where: { id: printId } });
}

export async function deleteAllPrintFiles(printId: string): Promise<void> {
  const rows = await prisma.printFile.findMany({ where: { printId } });
  const paths = rows.map((r) => managedPrintFilePath(r));
  // Print.preparedFileId FK will already be gone via cascade delete of the Print row itself,
  // but this helper runs against a still-live print (e.g. before a full print delete elsewhere).
  await prisma.printFile.deleteMany({ where: { printId } });
  for (const p of paths) {
    await fs.rm(p, { force: true }).catch(() => undefined);
    await pruneBundleDirs(path.dirname(p));
  }
}

export async function deletePreparedFile(userId: string, printId: string): Promise<Print> {
  const print = await prisma.print.findFirst({ where: { id: printId, userId } });
  if (!print || !print.preparedFileId) throw notFound("No prepared print file");
  const record = await prisma.printFile.findUnique({ where: { id: print.preparedFileId } });
  if (!record || record.printId !== printId || record.role !== "PREPARED") {
    throw notFound("No prepared print file");
  }
  const filePath = managedPrintFilePath(record);
  await prisma.$transaction([
    prisma.print.update({ where: { id: printId }, data: { preparedFileId: null } }),
    prisma.printFile.delete({ where: { id: record.id } }),
  ]);
  await fs.rm(filePath, { force: true }).catch(() => undefined);
  await pruneBundleDirs(path.dirname(filePath));
  return prisma.print.findUniqueOrThrow({ where: { id: printId } });
}
