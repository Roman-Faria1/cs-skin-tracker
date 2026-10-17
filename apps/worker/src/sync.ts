import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
import { Redis } from "ioredis";
import { refreshWatchlistResponseSchema } from "@csst/shared";
import type { WorkerEnv } from "./config.js";

const schedulerId = "watchlist-periodic";

export function createSyncProcessor(env: WorkerEnv, fetchImpl: typeof fetch = fetch) {
  return async (job: Pick<Job, "name" | "timestamp" | "opts">) => {
    if (!env.SYNC_ENABLED || job.name !== "sync-watchlist")
      return { skipped: true, reason: "Sync disabled or unknown job" };
    if (Date.now() - job.timestamp - (job.opts.delay ?? 0) > env.SYNC_INTERVAL_HOURS * 3600000)
      return { skipped: true, reason: "Expired job; catch-up sync skipped" };
    const response = await fetchImpl(new URL("/internal/sync", env.API_BASE_URL), {
      method: "POST",
      headers: { Authorization: `Bearer ${env.INTERNAL_SYNC_TOKEN}` },
      signal: AbortSignal.timeout(env.SYNC_REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`Sync API returned status ${response.status}`);
    return refreshWatchlistResponseSchema.parse(await response.json());
  };
}

export async function startSyncWorker(
  env: WorkerEnv,
  options: { queueName?: string; fetchImpl?: typeof fetch } = {}
) {
  if (!env.SYNC_ENABLED) return null;
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const name = options.queueName ?? "market-sync";
  const queue = new Queue(name, { connection });
  const worker = new Worker(name, createSyncProcessor(env, options.fetchImpl), {
    connection,
    concurrency: 1,
    maxStalledCount: 0,
    autorun: false
  });
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= (async () => {
      try {
        await worker.close();
      } finally {
        try {
          await queue.close();
        } finally {
          await connection.quit();
        }
      }
    })();
    return closing;
  };
  try {
    await queue.upsertJobScheduler(
      schedulerId,
      { every: env.SYNC_INTERVAL_HOURS * 3600000 },
      {
        name: "sync-watchlist",
        data: {},
        opts: { attempts: 1, removeOnComplete: { count: 50 }, removeOnFail: { count: 50 } }
      }
    );
  } catch (error) {
    await close();
    throw error;
  }
  return { queue, worker, close };
}
