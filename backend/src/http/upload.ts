import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { IMPORT_MAX_BYTES } from "../config";

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    cb(null, `thingport-upload-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

// Browsers send UTF-8 filenames but multer defaults to Latin-1.
const defParamCharset = "utf8";

/** Disk-backed, since model files can be large. */
export const modelUpload = multer({ storage: diskStorage, limits: { fileSize: IMPORT_MAX_BYTES }, defParamCharset });

// Kept in memory (sharp reads the buffer). 32 MB comfortably covers phone photos, screenshots and
// render exports; past it multer raises LIMIT_FILE_SIZE, which app.ts turns into a clean 413 rather
// than a 500 that the edit dialog surfaced as a generic failure.
export const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 },
  defParamCharset,
});
