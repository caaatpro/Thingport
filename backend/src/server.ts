import { createApp } from "./app";
import { API_PORT } from "./config";
import { prisma } from "./db"; // also ensures storage directories exist before we start serving
import { recoverAndStart } from "./services/processingQueue";

const app = createApp();

// A RUNNING job at startup means the previous process died mid-import; clear the lock.
prisma.importJob
  .updateMany({
    where: { status: "RUNNING" },
    data: { status: "ERROR", errorMessage: "Interrupted by server restart" },
  })
  .catch((err) => console.error("Failed to recover stale import jobs on startup:", err));

// Resume any processing jobs interrupted by a restart, and start the drainer.
void recoverAndStart();

app.listen(API_PORT, () => {
  console.log(`Thingport API listening on port ${API_PORT}`);
});
