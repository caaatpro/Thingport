import type { RenderOptions } from "./render";

// Messages between the server thread and previewWorker.ts. Kept apart from the worker entry so
// importing the types never starts a render.

export type ModelPreviewWorkerInput = { srcPath: string; destPath: string; options: RenderOptions };
export type ModelPreviewWorkerResult =
  { status: "ok" } | { status: "too-complex" } | { status: "unsupported" } | { status: "error"; error: string };
