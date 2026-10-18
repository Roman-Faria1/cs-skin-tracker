import { describe, expect, it } from "vitest";

import {
  addWatchlistItemRequestSchema,
  refreshWatchlistResponseSchema,
  watchlistImportSchema,
  watchlistTransferSchema,
  WATCHLIST_ITEM_LIMIT
} from "../src/index.js";
import { alertRuleInputSchema } from "../src/index.js";

describe("shared schemas", () => {
  it("trims valid market hash names", () => {
    const parsed = addWatchlistItemRequestSchema.parse({
      marketHashName: "  AK-47 | Redline (Field-Tested)  "
    });

    expect(parsed.marketHashName).toBe("AK-47 | Redline (Field-Tested)");
  });

  it("rejects empty market hash names", () => {
    expect(() => addWatchlistItemRequestSchema.parse({ marketHashName: "" })).toThrow();
  });

  it("defaults refresh response partial-failure fields", () => {
    const parsed = refreshWatchlistResponseSchema.parse({
      requestedItems: 1,
      snapshotsCreated: 5,
      remainingMonthlyBudget: 999
    });

    expect(parsed.failedItems).toBe(0);
    expect(parsed.itemResults).toEqual([]);
  });

  it("rejects unsupported transfer versions and oversized item lists", () => {
    expect(() => watchlistImportSchema.parse({ version: 2, items: [] })).toThrow();
    expect(() =>
      watchlistImportSchema.parse({
        version: 1,
        items: Array.from({ length: 1001 }, () => "AK-47 | Redline")
      })
    ).toThrow();
  });

  it("uses the same capacity for exported and imported files", () => {
    const transfer = watchlistTransferSchema.parse({
      version: 1,
      items: Array.from({ length: WATCHLIST_ITEM_LIMIT }, (_, i) => `Skin ${i}`)
    });
    expect(watchlistImportSchema.parse(JSON.parse(JSON.stringify(transfer)))).toEqual(transfer);
    expect(() =>
      watchlistTransferSchema.parse({ ...transfer, items: [...transfer.items, "One Too Many"] })
    ).toThrow();
  });
});

describe("alert rule validation", () => {
  const input = {
    itemId: "00000000-0000-4000-8000-000000000201",
    kind: "price_below",
    threshold: 20
  };
  it("defaults to all providers for valid price rules", () => {
    expect(alertRuleInputSchema.parse(input).providerId).toBeNull();
  });
  it.each([
    { threshold: 0 },
    { threshold: -1 },
    { threshold: 0.001 },
    { threshold: Infinity },
    { kind: "percent_change" },
    { kind: "provider_spread", providerId: "steam" },
    { kind: "stale_data", threshold: 0.5 },
    { kind: "stale_data", threshold: 8761 }
  ])("rejects invalid thresholds and provider configurations", (change) => {
    expect(alertRuleInputSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
});
