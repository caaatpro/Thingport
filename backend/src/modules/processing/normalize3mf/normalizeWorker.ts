import fs from "node:fs/promises";
import { parentPort, workerData } from "node:worker_threads";
import { writeNormalized3mf } from "./normalize";
import type { Normalize3mfWorkerInput, Normalize3mfWorkerResult } from "./workerProtocol";

// Worker entry point for one normalize. Posts exactly one message, then exits.

async function run(): Promise<void> {
  const { srcPath, destPath } = workerData as Normalize3mfWorkerInput;
  let result: Normalize3mfWorkerResult;
  try {
    await writeNormalized3mf(await fs.readFile(srcPath), destPath);
    result = { status: "ok" };
  } catch (err) {
    result = { status: "error", error: err instanceof Error ? (err.stack ?? err.message) : String(err) };
  }
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker_threads port, not window.postMessage.
  parentPort?.postMessage(result);
}

void run();
