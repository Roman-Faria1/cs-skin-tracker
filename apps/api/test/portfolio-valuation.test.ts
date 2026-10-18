import type { Holding, PriceSnapshot } from "@csst/shared";
import { describe, expect, it } from "vitest";
import { summarizePortfolio, valueHolding } from "../src/portfolio/portfolio-valuation.js";

const now = new Date("2026-10-17T12:00:00Z");
const holding: Holding = {
  id: "00000000-0000-4000-8000-000000000101",
  itemId: "00000000-0000-4000-8000-000000000201",
  marketHashName: "AK-47 | Redline (Field-Tested)",
  quantity: 3,
  acquisitionPrice: 0.1,
  notes: null,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  isWatched: true
};
const quote: PriceSnapshot = {
  id: "00000000-0000-4000-8000-000000000301",
  itemId: holding.itemId,
  provider: "steam",
  lowestAsk: 0.3,
  highestBid: null,
  askVolume: null,
  bidVolume: null,
  currency: "USD",
  sourceUpdatedAt: now.toISOString(),
  collectedAt: now.toISOString(),
  freshness: "fresh",
  isStale: false
};
const value = (
  changes: Partial<Holding> = {},
  quotes: PriceSnapshot[] = [quote],
  provider: string | null = null
) => valueHolding({ ...holding, ...changes }, quotes, now, provider);

describe("portfolio valuation", () => {
  it("calculates exact cost, value and profit in cents", () => {
    expect(value()).toMatchObject({
      costBasis: "0.30",
      marketValue: "0.90",
      unrealizedPnl: "0.60",
      unitPrice: "0.30",
      valuationStatus: "fresh"
    });
    expect(value({ acquisitionPrice: 0.4 }).unrealizedPnl).toBe("-0.30");
  });
  it("selects the cheapest fresh provider deterministically and honors the filter", () => {
    const quotes = [
      quote,
      { ...quote, provider: "csfloat", lowestAsk: 0.1 },
      { ...quote, provider: "skinport", lowestAsk: 0.01, sourceUpdatedAt: "2026-10-15T00:00:00Z" }
    ];
    expect(value({}, quotes).quote?.provider).toBe("csfloat");
    expect(value({}, quotes, "steam").marketValue).toBe("0.90");
    expect(value({}, quotes, "absent").valuationStatus).toBe("missing");
  });
  it.each([
    ["stale", { sourceUpdatedAt: "2026-10-15T00:00:00Z" }],
    ["stale", { collectedAt: "2026-10-15T00:00:00Z" }],
    ["unknown", { sourceUpdatedAt: null }],
    ["invalid_time", { collectedAt: "2026-10-18T00:00:00Z" }],
    ["invalid_time", { sourceUpdatedAt: "2026-10-18T00:00:00Z" }],
    ["missing", { lowestAsk: null }]
  ] as const)("keeps %s quotes out of totals", (status, changes) => {
    const result = value({}, [{ ...quote, ...changes }]);
    expect(result).toMatchObject({
      valuationStatus: status,
      marketValue: null,
      unitPrice: null,
      costBasis: "0.30",
      unrealizedPnl: null
    });
  });
  it("distinguishes missing quotes/costs from genuine zero values", () => {
    expect(value({}, []).valuationStatus).toBe("missing");
    expect(value({ acquisitionPrice: null })).toMatchObject({
      costBasis: null,
      unrealizedPnl: null,
      marketValue: "0.90"
    });
    expect(value({ acquisitionPrice: 0 }, [{ ...quote, lowestAsk: 0 }])).toMatchObject({
      costBasis: "0.00",
      marketValue: "0.00",
      unrealizedPnl: "0.00",
      valuationStatus: "fresh"
    });
  });
  it("preserves cents beyond JavaScript's safe integer range", () => {
    const big = value({ quantity: 1000000, acquisitionPrice: 9999999999.98 }, [
      { ...quote, lowestAsk: 9999999999.99 }
    ]);
    expect(big).toMatchObject({
      costBasis: "9999999999980000.00",
      marketValue: "9999999999990000.00",
      unrealizedPnl: "10000.00"
    });
    expect(summarizePortfolio([big, big]).grossAskValue).toBe("19999999999980000.00");
  });
  it("only compares costs and values from matched holdings in partial summaries", () => {
    const result = summarizePortfolio([value(), value({ acquisitionPrice: null }), value({}, [])]);
    expect(result).toMatchObject({
      holdingCount: 3,
      totalQuantity: 9,
      valuedHoldings: 2,
      unvaluedHoldings: 1,
      unknownCostHoldings: 1,
      pnlHoldings: 1,
      valuationStatus: "partial",
      grossAskValue: "1.80",
      knownCostBasis: "0.60",
      pricedCostBasis: "0.30",
      unrealizedPnl: "0.60"
    });
  });
  it("does not imply a worthless portfolio when prices are unavailable", () => {
    expect(summarizePortfolio([value({}, [])])).toMatchObject({
      valuationStatus: "unavailable",
      grossAskValue: null,
      unrealizedPnl: null
    });
    expect(summarizePortfolio([])).toMatchObject({
      valuationStatus: "complete",
      grossAskValue: "0.00",
      unrealizedPnl: "0.00"
    });
  });
  it("continues cached valuation of an unwatched holding without cross-item contamination", () => {
    expect(
      value({ isWatched: false }, [quote, { ...quote, itemId: "another", lowestAsk: 0 }])
        .marketValue
    ).toBe("0.90");
  });
});
