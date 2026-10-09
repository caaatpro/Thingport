import { createRouter } from "../../http/route";
import { modelUpload } from "../../http/upload";
import { badRequest } from "../../http/errors";
import { sendStoredFile } from "./fileResponse";
import { requireWritablePrint } from "./lookup";
import {
  deletePreparedFile,
  deleteSupportingFile,
  listReadableSupportingFiles,
  readablePreparedFile,
  readableSupportingFile,
  saveFileFromTemp,
} from "./printFiles";
import { toPrintFileOut } from "./dto";
import { printOutById } from "./printLoader";
import { removeTempFiles, type UploadedFile } from "./uploads";

export const fileRouter = createRouter();

fileRouter.get("/print/:id/files", async ({ params, userId }) =>
  (await listReadableSupportingFiles(userId, params.id)).map(toPrintFileOut),
);

fileRouter.post("/print/:id/files", { use: [modelUpload.single("file")] }, async ({ req, params, userId }) => {
  const file = req.file as UploadedFile | undefined;
  try {
    if (!file) throw badRequest("No file uploaded");
    const print = await requireWritablePrint(userId, params.id, "EDIT");
    await saveFileFromTemp(print.userId, print.id, file.path, file.originalname || "supporting-file", file.mimetype);
    return { print: await printOutById(userId, print.id) };
  } finally {
    if (file) await removeTempFiles([file]);
  }
});

fileRouter.get("/print/:id/files/:fileId", async ({ res, params, userId }) => {
  const { record, filePath } = await readableSupportingFile(userId, params.id, params.fileId);
  sendStoredFile(res, filePath, {
    contentType: record.mime || "application/octet-stream",
    downloadName: record.filename,
  });
});

fileRouter.delete("/print/:id/files/:fileId", async ({ params, userId }) => {
  const target = await requireWritablePrint(userId, params.id, "EDIT");
  const print = await deleteSupportingFile(target.userId, params.id, params.fileId);
  return { print: await printOutById(userId, print.id) };
});

fileRouter.get("/print/:id/prepared-print", async ({ res, params, userId }) => {
  const { record, filePath } = await readablePreparedFile(userId, params.id);
  sendStoredFile(res, filePath, {
    contentType: record.mime || "application/octet-stream",
    downloadName: record.filename,
  });
});

fileRouter.delete("/print/:id/prepared-print", async ({ params, userId }) => {
  const target = await requireWritablePrint(userId, params.id, "EDIT");
  const print = await deletePreparedFile(target.userId, params.id);
  return { print: await printOutById(userId, print.id) };
});
