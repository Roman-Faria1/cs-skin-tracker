import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { z } from "zod";

const envSchema = z.object({
  REDIS_URL: z.string().url().default("redis://localhost:6379")
});

const env = envSchema.parse(process.env);
const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

export const syncQueue = new Queue("market-sync", { connection });

const worker = new Worker(
  "market-sync",
  (job) => {
    if (job.name === "sync-watchlist") {
      // v0.2 will call the API sync service here once persistence is wired.
      return Promise.resolve({ skipped: true, reason: "sync service not wired yet" });
    }

    return Promise.resolve({ skipped: true, reason: `unknown job: ${job.name}` });
  },
  { connection }
);

worker.on("ready", () => {
  console.log("market-sync worker ready");
});

worker.on("failed", (job, error) => {
  console.error("market-sync job failed", {
    jobId: job?.id,
    jobName: job?.name,
    error
  });
});
