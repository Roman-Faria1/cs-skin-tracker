import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnvFile } from "node:process";
import { loadWorkerEnv } from "./config.js";
import { startSyncWorker } from "./sync.js";

let directory = process.cwd();
while (true) {
  const path = join(directory, ".env");
  if (existsSync(path)) {
    loadEnvFile(path);
    break;
  }
  const parent = dirname(directory);
  if (parent === directory) break;
  directory = parent;
}

async function main() {
  const env = loadWorkerEnv();
  const runtime = await startSyncWorker(env);
  if (runtime === null) {
    console.log("Scheduled sync disabled");
    return;
  }
  runtime.worker.on("error", (error) =>
    console.error("Sync worker error", { message: error.message })
  );
  runtime.queue.on("error", (error) =>
    console.error("Sync queue error", { message: error.message })
  );
  runtime.worker.on("failed", (job, error) =>
    console.error("Sync job failed; no automatic retry", { jobId: job?.id, message: error.message })
  );
  runtime.worker.on("completed", (job) => console.log("Sync job completed", { jobId: job.id }));
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void runtime.close().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  console.log("Scheduled sync ready", { intervalHours: env.SYNC_INTERVAL_HOURS });
  try {
    await runtime.worker.run();
  } finally {
    await runtime.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
