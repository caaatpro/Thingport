// Messages between the server thread and normalizeWorker.ts. Kept apart from the worker entry so
// importing the types never starts a job.

export type Normalize3mfWorkerInput = { srcPath: string; destPath: string };
export type Normalize3mfWorkerResult = { status: "ok" } | { status: "error"; error: string };
