import { describe, expect, it, vi } from "vitest";
import { loadWorkerEnv } from "../src/config.js";
import { createSyncProcessor, startSyncWorker } from "../src/sync.js";

const env = loadWorkerEnv({
  SYNC_ENABLED: "true",
  INTERNAL_SYNC_TOKEN: "test-token-with-at-least-32-characters"
});
const job = { name: "sync-watchlist", timestamp: Date.now(), opts: {} };
const result = {
  requestedItems: 2,
  snapshotsCreated: 1,
  remainingMonthlyBudget: 998,
  failedItems: 1,
  itemResults: []
};
describe("scheduled sync", () => {
  it("defaults to disabled and does not open a Redis connection", async () => {
    expect(await startSyncWorker(loadWorkerEnv({}))).toBeNull();
  });
  it("requires a long token and a conservative interval when enabled", () => {
    expect(() => loadWorkerEnv({ SYNC_ENABLED: "true" })).toThrow();
    expect(() => loadWorkerEnv({ SYNC_INTERVAL_HOURS: "1" })).toThrow();
    expect(loadWorkerEnv({ SYNC_ENABLED: "false" }).SYNC_ENABLED).toBe(false);
  });
  it("posts to the internal API and preserves partial failure outcomes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)));
    expect(await createSyncProcessor(env, fetchImpl)(job)).toEqual(result);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("http://localhost:4000/internal/sync"),
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: `Bearer ${env.INTERNAL_SYNC_TOKEN}` }
      })
    );
  });
  it("does not retry HTTP failures", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));
    await expect(createSyncProcessor(env, fetchImpl)(job)).rejects.toThrow("status 401");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("skips expired or unknown jobs and handles intended scheduled delays", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)));
    const processor = createSyncProcessor(env, fetchImpl);
    const old = Date.now() - 25 * 3600000;
    expect(await processor({ ...job, timestamp: old })).toMatchObject({ skipped: true });
    expect(await processor({ ...job, name: "unknown" })).toMatchObject({ skipped: true });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await processor({ ...job, timestamp: old, opts: { delay: 25 * 3600000 } })).toEqual(
      result
    );
  });
});
