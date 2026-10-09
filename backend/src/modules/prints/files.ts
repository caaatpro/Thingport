import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

/** Moves a file, falling back to copy + delete when `src` and `dest` are on different devices. */
export async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "EXDEV") throw err;
    await fs.copyFile(src, dest);
    await fs.rm(src, { force: true });
  }
}

/** Removes `start` and its parents while they are empty directories, never going above `root`. */
export async function pruneEmptyDirs(start: string, root: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  let current = start;
  while (
    fsSync.existsSync(current) &&
    path.resolve(current) !== resolvedRoot &&
    path.resolve(current).startsWith(resolvedRoot)
  ) {
    try {
      await fs.rmdir(current);
    } catch {
      break;
    }
    current = path.dirname(current);
  }
}
