import { parentPort, workerData } from "node:worker_threads";
import { renderModelPreviewGlb } from "./render";
import type { ModelPreviewWorkerInput, ModelPreviewWorkerResult } from "./workerProtocol";

// Worker entry point for one preview render. Posts exactly one message, then exits.

async function run(): Promise<void> {
  const { srcPath, destPath, options } = workerData as ModelPreviewWorkerInput;
  let result: ModelPreviewWorkerResult;
  try {
    result = { status: await renderModelPreviewGlb(srcPath, destPath, options) };
  } catch (err) {
    result = { status: "error", error: err instanceof Error ? (err.stack ?? err.message) : String(err) };
  }
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker_threads port, not window.postMessage.
  parentPort?.postMessage(result);
}

void run();
