import { Cs2CapClient, Cs2CapError } from "@csst/cs2cap";
import { describe, expect, it, vi } from "vitest";
import type { Cs2CapService } from "../src/cs2cap/cs2cap.service.js";
import type { WatchlistsRepository } from "../src/watchlists/watchlists.repository.js";
import { WatchlistsService } from "../src/watchlists/watchlists.service.js";

const entries = ["AK-47 | Redline (Field-Tested)", "AWP | Asiimov (Field-Tested)"].map(
  (marketHashName, i) => ({
    id: `00000000-0000-4000-8000-00000000010${i}`,
    item: {
      id: `00000000-0000-4000-8000-00000000020${i}`,
      marketHashName,
      imageUrl: null,
      createdAt: new Date().toISOString()
    },
    latestSnapshots: []
  })
);
const response = {
  data: { items: [{ provider: "steam", lowest_ask_decimal: "14.52" }] },
  rateLimit: { limit: 1000, remaining: 900, resetAt: null }
};

function setup() {
  let used = 25;
  const repository = {
    getWatchlistEntries: vi.fn().mockResolvedValue(entries),
    getMonthlyRequestUsage: vi.fn().mockImplementation(() => Promise.resolve(used)),
    reserveSyncRun: vi
      .fn()
      .mockImplementation(() => Promise.resolve({ status: "reserved", id: `run-${++used}` })),
    createSnapshots: vi.fn().mockResolvedValue(1),
    finishSyncRun: vi.fn().mockResolvedValue(undefined)
  };
  const provider = {
    isConfigured: vi.fn().mockReturnValue(true),
    getMonthlyRequestLimit: () => 1000,
    getRefreshCooldownSeconds: () => 3600,
    listPrices: vi.fn().mockResolvedValue(response)
  };
  const service = new WatchlistsService(
    provider as unknown as Cs2CapService,
    repository as unknown as WatchlistsRepository
  );
  return { service, provider, repository };
}

describe("WatchlistsService refresh safety", () => {
  it.each([401, 403, 429])(
    "stops remaining items when an HTTP %i body read fails",
    async (status) => {
      const { service, provider, repository } = setup();
      const client = new Cs2CapClient({
        apiKey: "test",
        fetchImpl: () =>
          Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.error(new Error("Connection lost after headers"));
                }
              }),
              { status, headers: { "x-ratelimit-remaining": "0" } }
            )
          )
      });
      provider.listPrices.mockImplementation((marketHashName: string) =>
        client.listPrices({ marketHashName })
      );
      const result = await service.refresh();
      expect(result.itemResults.map((item) => item.status)).toEqual(["failed", "skipped"]);
      expect(repository.reserveSyncRun).toHaveBeenCalledTimes(1);
      expect(provider.listPrices).toHaveBeenCalledTimes(1);
      expect(repository.finishSyncRun).toHaveBeenCalledWith(
        expect.objectContaining({ responseStatus: status, rateLimitRemaining: 0 })
      );
    }
  );
  it("skips unconfigured providers without reserving or spending requests", async () => {
    const { service, provider, repository } = setup();
    provider.isConfigured.mockReturnValue(false);
    const result = await service.refresh();
    expect(result.itemResults.map((item) => item.status)).toEqual(["skipped", "skipped"]);
    expect(result.remainingMonthlyBudget).toBe(975);
    expect(repository.reserveSyncRun).not.toHaveBeenCalled();
    expect(provider.listPrices).not.toHaveBeenCalled();
  });

  it.each(["CS2Cap monthly request budget is exhausted", "Item refresh cooldown is active"])(
    "retains cached prices when %s",
    async (reason) => {
      const { service, provider, repository } = setup();
      repository.reserveSyncRun.mockResolvedValue({ status: "skipped", reason });
      const result = await service.refresh();
      expect(result.remainingMonthlyBudget).toBe(975);
      expect(result.itemResults.every((item) => item.status === "skipped")).toBe(true);
      expect(provider.listPrices).not.toHaveBeenCalled();
      expect(repository.createSnapshots).not.toHaveBeenCalled();
    }
  );

  it("continues after a reservation failure and uses persisted budget usage", async () => {
    const { service, provider, repository } = setup();
    repository.reserveSyncRun.mockRejectedValueOnce(new Error("database unavailable"));
    const result = await service.refresh();
    expect(result.itemResults.map((item) => item.status)).toEqual(["failed", "succeeded"]);
    expect(result.remainingMonthlyBudget).toBe(974);
    expect(provider.listPrices).toHaveBeenCalledTimes(1);
    expect(provider.listPrices).toHaveBeenCalledWith(entries[1]?.item.marketHashName);
  });

  it("continues after a provider failure, retaining successful snapshots", async () => {
    const { service, provider } = setup();
    provider.listPrices.mockRejectedValueOnce(new Error("Provider unavailable"));
    const result = await service.refresh();
    expect(result.itemResults.map((item) => item.status)).toEqual(["failed", "succeeded"]);
    expect(result.snapshotsCreated).toBe(1);
    expect(result.remainingMonthlyBudget).toBe(973);
  });

  it.each([401, 403, 429])(
    "stops after provider status %i and retains rate-limit metadata",
    async (status) => {
      const { service, provider, repository } = setup();
      const rateLimit = { limit: 1000, remaining: 0, resetAt: new Date("2026-11-01T00:00:00Z") };
      provider.listPrices.mockRejectedValueOnce(
        new Cs2CapError(`CS2Cap status ${status}`, status, "private upstream body", rateLimit)
      );
      const result = await service.refresh();
      expect(result.itemResults.map((item) => item.status)).toEqual(["failed", "skipped"]);
      expect(provider.listPrices).toHaveBeenCalledTimes(1);
      expect(repository.reserveSyncRun).toHaveBeenCalledTimes(1);
      expect(repository.finishSyncRun).toHaveBeenCalledWith(
        expect.objectContaining({
          responseStatus: status,
          rateLimitRemaining: 0,
          rateLimitResetAt: rateLimit.resetAt
        })
      );
      expect(JSON.stringify(result)).not.toContain("private upstream body");
    }
  );

  it("stops on a successful response with no remaining provider quota", async () => {
    const { service, provider } = setup();
    provider.listPrices.mockResolvedValueOnce({
      ...response,
      rateLimit: { ...response.rateLimit, remaining: 0 }
    });
    expect((await service.refresh()).itemResults.map((item) => item.status)).toEqual([
      "succeeded",
      "skipped"
    ]);
    expect(provider.listPrices).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])(
    "continues after a sync-log finalization failure (provider succeeded: %s)",
    async (succeeds) => {
      const { service, provider, repository } = setup();
      if (!succeeds) provider.listPrices.mockRejectedValueOnce(new Error("Request timed out"));
      repository.finishSyncRun.mockRejectedValueOnce(new Error("database unavailable"));
      const result = await service.refresh();
      expect(result.itemResults.map((item) => item.status)).toEqual(["failed", "succeeded"]);
      expect(result.snapshotsCreated).toBe(succeeds ? 2 : 1);
      expect(result.itemResults[0]?.errorMessage).toContain("sync log could not be finalized");
      expect(repository.finishSyncRun).toHaveBeenCalledTimes(2);
      expect(provider.listPrices).toHaveBeenCalledTimes(2);
    }
  );
});
