import { randomUUID } from "node:crypto";
import { QueueEvents } from "bullmq";
import { Redis } from "ioredis";
import { expect, it, vi } from "vitest";
import { loadWorkerEnv } from "../src/config.js";
import { startSyncWorker } from "../src/sync.js";

it.skipIf(!process.env.TEST_REDIS_URL)(
  "registers one scheduler and fails jobs without retrying in Redis",
  async () => {
    const redisUrl = process.env.TEST_REDIS_URL!;
    const name = `market-sync-test-${randomUUID()}`;
    const env = loadWorkerEnv({
      REDIS_URL: redisUrl,
      SYNC_ENABLED: "true",
      INTERNAL_SYNC_TOKEN: "test-token-with-at-least-32-characters"
    });
    const fetchImpl = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response("blocked", { status: 429 })));
    const runtime = await startSyncWorker(env, { queueName: name, fetchImpl });
    if (!runtime) throw new Error("Expected enabled worker");
    const eventsConnection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const events = new QueueEvents(name, { connection: eventsConnection });
    let run: Promise<void> | undefined;
    try {
      await events.waitUntilReady();
      const second = await startSyncWorker(env, { queueName: name, fetchImpl });
      await second?.close();
      expect(await runtime.queue.getJobSchedulers()).toHaveLength(1);
      expect(runtime.worker.opts.maxStalledCount).toBe(0);
      const scheduled = await runtime.queue.getDelayed();
      expect(scheduled.every((job) => job.opts.attempts === 1)).toBe(true);
      const job = await runtime.queue.add("sync-watchlist", {}, { attempts: 1 });
      run = runtime.worker.run();
      await expect(job.waitUntilFinished(events, 10000)).rejects.toThrow("status 429");
      const failed = await runtime.queue.getJob(job.id!);
      expect(await failed?.getState()).toBe("failed");
      expect(failed?.attemptsMade).toBe(1);
    } finally {
      await runtime.worker.close();
      await run;
      await events.close();
      await eventsConnection.quit();
      await runtime.queue.obliterate({ force: true });
      await runtime.close();
    }
  },
  20000
);
