import { createRequire } from "node:module";
import path from "node:path";

/** Source for `new Worker(src, { eval: true })` that loads `name` from `dir`. Under tsx (dev, vitest)
 *  the worker needs tsx's hook registered first: workers don't inherit the parent's loader, and on
 *  Node 20 `--import tsx` doesn't apply to the entry file. */
export function workerBootstrap(dir: string, name: string): string {
  const ext = path.extname(__filename);
  const file = JSON.stringify(path.join(dir, `${name}${ext}`));
  if (ext !== ".ts") return `require(${file});`;
  return `require(${JSON.stringify(createRequire(__filename).resolve("tsx/cjs"))}); require(${file});`;
}
