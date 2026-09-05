import { describe, expect, it } from "vitest";

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
      remainingMonthlyBudget: 975
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
});
