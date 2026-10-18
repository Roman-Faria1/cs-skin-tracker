import type { Holding, Portfolio, PriceSnapshot, ValuedHolding } from "@csst/shared";
import { getSnapshotFreshness } from "../watchlists/watchlists.utils.js";

const cents = (value: number) => BigInt(Math.round(value * 100));
function money(value: bigint): string {
  const abs = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

export function valueHolding(
  holding: Holding,
  latest: PriceSnapshot[],
  now: Date,
  providerId: string | null
): ValuedHolding {
  const scoped = latest.filter(
    (quote) =>
      quote.itemId === holding.itemId && (providerId === null || quote.provider === providerId)
  );
  const status = (quote: PriceSnapshot): ValuedHolding["valuationStatus"] => {
    if (
      Date.parse(quote.collectedAt) > now.getTime() ||
      (quote.sourceUpdatedAt !== null && Date.parse(quote.sourceUpdatedAt) > now.getTime())
    )
      return "invalid_time";
    return getSnapshotFreshness(
      new Date(quote.collectedAt),
      quote.sourceUpdatedAt === null ? null : new Date(quote.sourceUpdatedAt),
      now
    );
  };
  const priced = scoped.filter((quote) => quote.lowestAsk !== null);
  const fresh = priced
    .filter((quote) => status(quote) === "fresh")
    .sort((a, b) => a.lowestAsk! - b.lowestAsk! || a.provider.localeCompare(b.provider));
  // Diagnostic quotes are evidence only; stale/unknown values never enter totals.
  const quote =
    fresh[0] ??
    priced
      .slice()
      .sort(
        (a, b) => Date.parse(b.collectedAt) - Date.parse(a.collectedAt) || b.id.localeCompare(a.id)
      )[0] ??
    scoped[0] ??
    null;
  const cost =
    holding.acquisitionPrice === null
      ? null
      : cents(holding.acquisitionPrice) * BigInt(holding.quantity);
  const value =
    fresh[0] === undefined ? null : cents(fresh[0].lowestAsk!) * BigInt(holding.quantity);
  return {
    ...holding,
    valuationStatus:
      fresh.length > 0 ? "fresh" : priced.length > 0 && quote !== null ? status(quote) : "missing",
    quote,
    unitPrice: fresh[0] === undefined ? null : money(cents(fresh[0].lowestAsk!)),
    costBasis: cost === null ? null : money(cost),
    marketValue: value === null ? null : money(value),
    unrealizedPnl: value === null || cost === null ? null : money(value - cost)
  };
}

function amount(value: string): bigint {
  return BigInt(value.replace(".", ""));
}
export function summarizePortfolio(holdings: ValuedHolding[]): Portfolio["summary"] {
  const valued = holdings.filter((holding) => holding.marketValue !== null);
  const matched = valued.filter((holding) => holding.costBasis !== null);
  const sum = (rows: ValuedHolding[], key: "costBasis" | "marketValue" | "unrealizedPnl") =>
    money(rows.reduce((total, row) => total + amount(row[key] ?? "0.00"), 0n));
  return {
    holdingCount: holdings.length,
    totalQuantity: holdings.reduce((total, holding) => total + holding.quantity, 0),
    valuedHoldings: valued.length,
    unvaluedHoldings: holdings.length - valued.length,
    unknownCostHoldings: holdings.filter((holding) => holding.costBasis === null).length,
    pnlHoldings: matched.length,
    valuationStatus:
      valued.length === holdings.length
        ? "complete"
        : valued.length === 0
          ? "unavailable"
          : "partial",
    grossAskValue: valued.length > 0 || holdings.length === 0 ? sum(valued, "marketValue") : null,
    knownCostBasis: sum(holdings, "costBasis"),
    pricedCostBasis: matched.length > 0 || holdings.length === 0 ? sum(matched, "costBasis") : null,
    unrealizedPnl:
      matched.length > 0 || holdings.length === 0 ? sum(matched, "unrealizedPnl") : null
  };
}
