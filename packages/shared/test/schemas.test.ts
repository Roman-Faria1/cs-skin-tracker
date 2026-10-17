import { describe, expect, it } from "vitest";

import {
  addWatchlistItemRequestSchema,
  refreshWatchlistResponseSchema,
  watchlistImportSchema,
  watchlistTransferSchema,
  WATCHLIST_ITEM_LIMIT
} from "../src/index.js";

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
