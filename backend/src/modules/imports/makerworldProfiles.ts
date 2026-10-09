import fs from "node:fs";
import crypto from "node:crypto";
import { prisma } from "../../db";
import type { Plate } from "../../generated/prisma/client";
import { parseMakerworldModelUrl } from "./providers/makerworld/urls";
import { addPlatesToPrint, resolvePlateFilePath } from "../prints/index";
import { isUniqueConstraintError } from "./createImportedPrint";
import { removeTempFiles, saveImportResponseToTemp } from "./download";
import { platesOf, type ExistingImportedPrint } from "./importedPrints";
import { openImportResponse } from "./resolveLink";
import type { ImportedPrint, ImportRequestBody } from "./types";

async function sha256OfFile(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function plateContentSha256(plate: Plate): Promise<string | null> {
  if (plate.contentSha256) return plate.contentSha256;
  const filePath = resolvePlateFilePath(plate);
  if (!filePath || !fs.existsSync(filePath)) return null;
  const sha = await sha256OfFile(filePath);
  await prisma.plate.update({
    where: { id: plate.id },
    data: { contentSha256: sha },
  });
  return sha;
}

/** Re-import of a MakerWorld design: each profile's 3MF has its own settings, so a new profile is
 * added as another plate. Untagged plates are compared by SHA-256 first so a match is tagged
 * instead of duplicated. */
export async function addMakerworldProfileToPrint(
  existing: ExistingImportedPrint,
  url: string,
  body: ImportRequestBody,
): Promise<ImportedPrint> {
  const alreadyImported = { ...existing, alreadyImported: true };
  const hasProfile = (instanceId: string) => existing.plates.some((plate) => plate.sourceInstanceId === instanceId);

  // Checked before any MakerWorld request: resolving the default profile would cost one
  // CAPTCHA-prone lookup per design on a collection re-import.
  const wanted = body.resolved_instance_id ?? parseMakerworldModelUrl(url)?.requestedInstanceId ?? null;
  if (!wanted || hasProfile(wanted)) return alreadyImported;

  // Fetch the extension-resolved download as is: another page request per profile risks the CAPTCHA.
  const presolved = Boolean(body.resolved_download_url && body.resolved_instance_id);
  const opened = presolved
    ? await openImportResponse(body.resolved_download_url!, { ...body, resolved_download_url: null }, url)
    : await openImportResponse(url, body);
  const instanceId = presolved ? body.resolved_instance_id! : (opened.meta.makerworldProfile?.instanceId ?? null);
  // Unknown profile, or the resolver fell back to one already on the print.
  if (!instanceId || hasProfile(instanceId)) {
    await opened.response.body?.cancel().catch(() => undefined);
    return alreadyImported;
  }

  const { tempPath, filename, mime } = await saveImportResponseToTemp(opened, body);
  try {
    const untagged = existing.plates.filter((plate) => plate.sourceInstanceId == null);
    if (untagged.length) {
      const downloadedSha = await sha256OfFile(tempPath);
      for (const plate of untagged) {
        if ((await plateContentSha256(plate)) !== downloadedSha) continue;
        try {
          await prisma.plate.update({
            where: { id: plate.id },
            data: { sourceInstanceId: instanceId },
          });
        } catch (err) {
          // Race guard: a concurrent import of this same profile won.
          if (!isUniqueConstraintError(err)) throw err;
        }
        return { ...alreadyImported, plates: await platesOf(existing.print.id) };
      }
    }

    try {
      await addPlatesToPrint(existing.print.userId, existing.print.id, [
        {
          filename,
          mime,
          tempFilePath: tempPath,
          sourceInstanceId: instanceId,
        },
      ]);
    } catch (err) {
      // Race guard: a concurrent import of this same profile won.
      if (isUniqueConstraintError(err)) return alreadyImported;
      throw err;
    }
    return {
      ...existing,
      plates: await platesOf(existing.print.id),
      alreadyImported: false,
      profileAdded: true,
    };
  } finally {
    await removeTempFiles([tempPath]);
  }
}
