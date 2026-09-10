import { describe, expect, it, vi } from "vitest";

import type { Cs2CapService } from "../src/cs2cap/cs2cap.service.js";
import type { WatchlistsRepository } from "../src/watchlists/watchlists.repository.js";
import { WatchlistsService } from "../src/watchlists/watchlists.service.js";

const watchlistItem = {
  id: "00000000-0000-4000-8000-000000000101",
  item: {
    id: "00000000-0000-4000-8000-000000000201",
    marketHashName: "AK-47 | Redline (Field-Tested)",
    imageUrl: null,
    createdAt: new Date().toISOString()
  },
  latestSnapshots: []
};

const secondWatchlistItem = {
  id: "00000000-0000-4000-8000-000000000102",
  item: {
    id: "00000000-0000-4000-8000-000000000202",
    marketHashName: "AWP | Asiimov (Field-Tested)",
    imageUrl: null,
    createdAt: new Date().toISOString()
  },
  latestSnapshots: []
};

describe("WatchlistsService", () => {
  it("does not call CS2Cap when the provider is not configured", async () => {
    const service = new WatchlistsService(
      {
        getMonthlyRequestLimit: () => 1000,
        isConfigured: () => false
      } as unknown as Cs2CapService,
      {
        getWatchlistEntries: () => Promise.resolve([watchlistItem]),
        getMonthlyRequestUsage: () => Promise.resolve(25)
      } as unknown as WatchlistsRepository
    );

    await expect(service.refresh()).resolves.toEqual({
      requestedItems: 1,
      snapshotsCreated: 0,
      remainingMonthlyBudget: 975,
      failedItems: 0,
      itemResults: [
        {
          itemId: watchlistItem.item.id,
          marketHashName: watchlistItem.item.marketHashName,
          status: "skipped",
          snapshotsCreated: 0,
          errorMessage: "CS2Cap API key is not configured"
        }
      ]
    });
  });

  it("blocks refreshes that would exceed the monthly request budget", async () => {
    const service = new WatchlistsService(
      {
        getMonthlyRequestLimit: () => 25,
        isConfigured: () => true
      } as unknown as Cs2CapService,
      {
        getWatchlistEntries: () => Promise.resolve([watchlistItem]),
        getMonthlyRequestUsage: () => Promise.resolve(25)
      } as unknown as WatchlistsRepository
    );

    await expect(service.refresh()).rejects.toThrow(
      "CS2Cap monthly request budget would be exceeded"
    );
  });

  it("records partial refresh failures without dropping successful snapshots", async () => {
    const listPrices = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              provider: "steam",
              lowest_ask_decimal: "14.52",
              highest_bid_decimal: "13.40",
              quantity: 12,
              bid_volume: 4,
              timestamp: "2026-09-10T12:00:00.000Z"
            }
          ]
        },
        rateLimit: {
          limit: 1000,
          remaining: 998,
          resetAt: null
        }
      })
      .mockRejectedValueOnce(new Error("CS2Cap unavailable"));
    const createSyncRun = vi
      .fn()
      .mockResolvedValueOnce("sync-run-1")
      .mockResolvedValueOnce("sync-run-2");
    const createSnapshots = vi.fn().mockResolvedValue(1);
    const finishSyncRun = vi.fn();
    const service = new WatchlistsService(
      {
        getMonthlyRequestLimit: () => 1000,
        isConfigured: () => true,
        listPrices
      } as unknown as Cs2CapService,
      {
        getWatchlistEntries: () => Promise.resolve([watchlistItem, secondWatchlistItem]),
        getMonthlyRequestUsage: () => Promise.resolve(0),
        createSyncRun,
        createSnapshots,
        finishSyncRun
      } as unknown as WatchlistsRepository
    );

    await expect(service.refresh()).resolves.toEqual({
      requestedItems: 2,
      snapshotsCreated: 1,
      remainingMonthlyBudget: 998,
      failedItems: 1,
      itemResults: [
        {
          itemId: watchlistItem.item.id,
          marketHashName: watchlistItem.item.marketHashName,
          status: "succeeded",
          snapshotsCreated: 1
        },
        {
          itemId: secondWatchlistItem.item.id,
          marketHashName: secondWatchlistItem.item.marketHashName,
          status: "failed",
          snapshotsCreated: 0,
          errorMessage: "CS2Cap unavailable"
        }
      ]
    });
    expect(createSyncRun).toHaveBeenNthCalledWith(1, {
      itemId: watchlistItem.item.id,
      marketHashName: watchlistItem.item.marketHashName,
      requestedItemCount: 1,
      requestCost: 1
    });
    expect(createSyncRun).toHaveBeenNthCalledWith(2, {
      itemId: secondWatchlistItem.item.id,
      marketHashName: secondWatchlistItem.item.marketHashName,
      requestedItemCount: 1,
      requestCost: 1
    });
    expect(finishSyncRun).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: "sync-run-1",
        status: "succeeded",
        snapshotsCreated: 1,
        responseStatus: 200
      })
    );
    expect(finishSyncRun).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: "sync-run-2",
        status: "failed",
        snapshotsCreated: 0,
        responseStatus: null,
        errorMessage: "CS2Cap unavailable"
      })
    );
  });

  it("continues when a sync run cannot be created for one item", async () => {
    const listPrices = vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            provider: "steam",
            lowest_ask_decimal: "72.10",
            highest_bid_decimal: "70.50",
            quantity: 3,
            bid_volume: 2,
            timestamp: "2026-09-10T12:00:00.000Z"
          }
        ]
      },
      rateLimit: {
        limit: 1000,
        remaining: 998,
        resetAt: null
      }
    });
    const createSyncRun = vi
      .fn()
      .mockRejectedValueOnce(new Error("Unable to create sync run"))
      .mockResolvedValueOnce("sync-run-2");
    const createSnapshots = vi.fn().mockResolvedValue(1);
    const finishSyncRun = vi.fn();
    const service = new WatchlistsService(
      {
        getMonthlyRequestLimit: () => 1000,
        isConfigured: () => true,
        listPrices
      } as unknown as Cs2CapService,
      {
        getWatchlistEntries: () => Promise.resolve([watchlistItem, secondWatchlistItem]),
        getMonthlyRequestUsage: () => Promise.resolve(0),
        createSyncRun,
        createSnapshots,
        finishSyncRun
      } as unknown as WatchlistsRepository
    );

    await expect(service.refresh()).resolves.toEqual({
      requestedItems: 2,
      snapshotsCreated: 1,
      remainingMonthlyBudget: 999,
      failedItems: 1,
      itemResults: [
        {
          itemId: watchlistItem.item.id,
          marketHashName: watchlistItem.item.marketHashName,
          status: "failed",
          snapshotsCreated: 0,
          errorMessage: "Unable to create sync run"
        },
        {
          itemId: secondWatchlistItem.item.id,
          marketHashName: secondWatchlistItem.item.marketHashName,
          status: "succeeded",
          snapshotsCreated: 1
        }
      ]
    });
    expect(listPrices).toHaveBeenCalledTimes(1);
    expect(listPrices).toHaveBeenCalledWith(secondWatchlistItem.item.marketHashName);
    expect(finishSyncRun).toHaveBeenCalledTimes(1);
    expect(finishSyncRun).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sync-run-2",
        status: "succeeded",
        snapshotsCreated: 1,
        responseStatus: 200
      })
    );
  });
});
