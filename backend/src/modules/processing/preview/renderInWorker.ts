import { Worker } from "node:worker_threads";
import { MODEL_PREVIEW_MAX_MEMORY_MB, MODEL_PREVIEW_TIMEOUT_SECONDS } from "../../../config";
import { workerBootstrap } from "../../../lib/workerBootstrap";
import type { ModelPreviewWorkerInput, ModelPreviewWorkerResult } from "./workerProtocol";

// Renders run in a worker thread under memory and time limits, so a pathological .3mf can't take
// down the server.

const WORKER_BOOTSTRAP = workerBootstrap(__dirname, "previewWorker");

const MEMORY_POLL_MS = 250;

export type RenderOutcome =
  | { status: "ok" }
  | { status: "too-complex" }
  | { status: "unsupported" }
  | { status: "limit"; reason: string }
  | { status: "error"; error: string };

/** Resolves once the thread is gone, so its memory is freed before the next render. Never
 * rejects. Mesh data lives outside the V8 heap cap, so a watchdog also polls process RSS. */
export function renderInWorker(input: ModelPreviewWorkerInput): Promise<RenderOutcome> {
  return new Promise((resolve) => {
    const maxGrowthBytes = MODEL_PREVIEW_MAX_MEMORY_MB * 1024 * 1024;
    const baselineRss = process.memoryUsage.rss();
    const worker = new Worker(WORKER_BOOTSTRAP, {
      eval: true,
      workerData: input,
      resourceLimits: { maxOldGenerationSizeMb: MODEL_PREVIEW_MAX_MEMORY_MB },
    });

    let settled = false;
    const finish = (outcome: RenderOutcome) => {
      if (settled) return;
      settled = true;
      clearInterval(watchdog);
      clearTimeout(timeout);
      worker.terminate().then(
        () => resolve(outcome),
        () => resolve(outcome),
      );
    };

    const watchdog = setInterval(() => {
      const grown = process.memoryUsage.rss() - baselineRss;
      if (grown > maxGrowthBytes) {
        finish({
          status: "limit",
          reason: `memory grew by ${Math.round(grown / 1024 / 1024)} MB (limit ${MODEL_PREVIEW_MAX_MEMORY_MB} MB)`,
        });
      }
    }, MEMORY_POLL_MS);
    const timeout = setTimeout(
      () => finish({ status: "limit", reason: `took longer than ${MODEL_PREVIEW_TIMEOUT_SECONDS}s` }),
      MODEL_PREVIEW_TIMEOUT_SECONDS * 1000,
    );

    worker.once("message", (result: ModelPreviewWorkerResult) => finish(result));
    worker.once("error", (err: NodeJS.ErrnoException) => {
      finish(
        err.code === "ERR_WORKER_OUT_OF_MEMORY"
          ? { status: "limit", reason: `worker heap exceeded ${MODEL_PREVIEW_MAX_MEMORY_MB} MB` }
          : { status: "error", error: err.stack ?? String(err) },
      );
    });
    worker.once("exit", (code) => finish({ status: "error", error: `worker exited (code ${code}) without a result` }));
  });
}
