import type {
  ComparableMovement,
  MovementReport,
  MovementWindow,
  Portfolio,
  PriceSnapshot
} from "@csst/shared";

const asOf = "2026-10-18T12:00:00.000Z";
export const emptyPortfolio: Portfolio = {
  asOf,
  providerId: null,
  providers: [{ id: "steam", name: "Steam" }],
  holdings: [],
  summary: {
    holdingCount: 0,
    totalQuantity: 0,
    valuedHoldings: 0,
    unvaluedHoldings: 0,
    unknownCostHoldings: 0,
    pnlHoldings: 0,
    valuationStatus: "complete",
    grossAskValue: "0.00",
    knownCostBasis: "0.00",
    pricedCostBasis: "0.00",
    unrealizedPnl: "0.00"
  }
};

export function movementFixture(
  window: MovementWindow = "24h",
  providerId: string | null = null
): MovementReport {
  const comparisonAt = window === "24h" ? "2026-10-17T12:00:00.000Z" : "2026-10-11T12:00:00.000Z";
  const make = (
    suffix: string,
    marketHashName: string,
    price: number,
    old: number
  ): ComparableMovement => {
    const itemId = `00000000-0000-4000-8000-00000000020${suffix}`;
    const current: PriceSnapshot = {
      id: `00000000-0000-4000-8000-00000000030${suffix}`,
      itemId,
      provider: providerId ?? "steam",
      lowestAsk: price,
      highestBid: null,
      askVolume: 10,
      bidVolume: null,
      currency: "USD",
      collectedAt: asOf,
      sourceUpdatedAt: asOf,
      freshness: "fresh",
      isStale: false
    };
    return {
      itemId,
      marketHashName,
      status: "comparable",
      providerId: current.provider,
      current,
      baseline: {
        ...current,
        id: `00000000-0000-4000-8000-00000000040${suffix}`,
        lowestAsk: old,
        collectedAt: comparisonAt,
        sourceUpdatedAt: comparisonAt
      },
      changeUsd: (price - old).toFixed(2),
      changePercent: ((price - old) / old) * 100,
      direction: price > old ? "up" : "down"
    };
  };
  const up = make("1", "AK-47 | Redline (Field-Tested)", 20, window === "24h" ? 10 : 5);
  const down = make("2", "AWP | Asiimov (Field-Tested)", 8, 10);
  return {
    asOf,
    comparisonAt,
    window,
    maxBaselineAgeHours: 24,
    providerId,
    providers: [
      { id: "steam", name: "Steam" },
      { id: "skinport", name: "Skinport" }
    ],
    items: [
      up,
      down,
      {
        itemId: "00000000-0000-4000-8000-000000000203",
        marketHashName: "M4A1-S | Printstream (Field-Tested)",
        status: "missing_baseline",
        providerId: "steam",
        current: { ...up.current, itemId: "00000000-0000-4000-8000-000000000203" },
        baseline: null,
        changePercent: null,
        changeUsd: null,
        direction: null
      }
    ],
    gainers: [up],
    decliners: [down],
    summary: { watchedItems: 3, comparableItems: 2, excludedItems: 1, up: 1, down: 1, flat: 0 }
  };
}
