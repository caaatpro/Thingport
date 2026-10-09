import fs from "node:fs/promises";
import "./fileReaderPolyfill";
import { buildGlbGroup } from "./glbGroup";
import { simplifyGroupMeshes } from "./meshSimplify";
import { type PreviewRefusal, parseThreeMfFast } from "./parse";

// Builds the cached GLB the 3D preview loads instead of parsing a raw .3mf in the browser. It
// follows the same rules as frontend/src/utils/bambuThreeMf.ts but scans the XML with regexes
// into typed arrays instead of a DOM, which hangs on models with millions of triangles.
//
// Runs in a worker thread (previewWorker.ts); keep it free of config/db imports.

export type RenderOptions = {
  /** Null keeps the exact geometry. */
  simplifyTo: number | null;
};

export async function renderModelPreviewGlb(
  srcPath: string,
  destPath: string,
  options: RenderOptions = { simplifyTo: null },
): Promise<"ok" | PreviewRefusal> {
  const parsed = await parseThreeMfFast(srcPath);
  if (typeof parsed === "string") return parsed;
  const group = await buildGlbGroup(parsed);
  if (options.simplifyTo) {
    const simplified = await simplifyGroupMeshes(group, options.simplifyTo);
    // Lets a later settings change find affected previews without re-rendering them.
    if (simplified) {
      const meta = JSON.parse(group.userData.thingportPreview as string) as Record<string, unknown>;
      group.userData.thingportPreview = JSON.stringify({ ...meta, simplified });
    }
  }
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const result = await new GLTFExporter().parseAsync(group, { binary: true });
  await fs.writeFile(destPath, Buffer.from(result as ArrayBuffer));
  return "ok";
}
