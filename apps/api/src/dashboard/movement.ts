import type { ComparableMovement, MovementItem, MovementReport, PriceSnapshot } from "@csst/shared";
import { getSnapshotFreshness } from "../watchlists/watchlists.utils.js";

const cents = (value: number) => BigInt(Math.round(value * 100));
function signedMoney(value: bigint) {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}
function quality(quote: PriceSnapshot, reference: Date): "fresh" | "stale" | "unknown" | "invalid" {
  if (
    Date.parse(quote.collectedAt) > reference.getTime() ||
    (quote.sourceUpdatedAt !== null && Date.parse(quote.sourceUpdatedAt) > reference.getTime()) ||
    (quote.lowestAsk !== null && (!Number.isFinite(quote.lowestAsk) || quote.lowestAsk < 0))
  )
    return "invalid";
  return getSnapshotFreshness(
    new Date(quote.collectedAt),
    quote.sourceUpdatedAt === null ? null : new Date(quote.sourceUpdatedAt),
    reference
  );
}

function evidence(quote: PriceSnapshot | null): PriceSnapshot | null {
  if (quote === null) return null;
  const nonnegative = (value: number | null) =>
    value !== null && Number.isFinite(value) && value >= 0 ? value : null;
  const volume = (value: number | null) =>
    value !== null && Number.isInteger(value) && value >= 0 ? value : null;
  // Classify raw quotes first; invalid cached numbers must not break the response contract.
  return {
    ...quote,
    lowestAsk: nonnegative(quote.lowestAsk),
    highestBid: nonnegative(quote.highestBid),
    askVolume: volume(quote.askVolume),
    bidVolume: volume(quote.bidVolume)
  };
}

export function compareItem(
  item: { itemId: string; marketHashName: string },
  latest: PriceSnapshot[],
  historical: PriceSnapshot[],
  now: Date,
  cutoff: Date,
  providerId: string | null
): MovementItem {
  const scoped = latest.filter(
    (quote) =>
      quote.itemId === item.itemId && (providerId === null || quote.provider === providerId)
  );
  const current =
    scoped
      .filter((quote) => quote.lowestAsk !== null && quality(quote, now) === "fresh")
      .sort((a, b) => a.lowestAsk! - b.lowestAsk! || a.provider.localeCompare(b.provider))[0] ??
    scoped
      .slice()
      .sort(
        (a, b) => Date.parse(b.collectedAt) - Date.parse(a.collectedAt) || b.id.localeCompare(a.id)
      )[0] ??
    null;
  const baseline =
    current === null
      ? null
      : (historical.find(
          (quote) => quote.itemId === item.itemId && quote.provider === current.provider
        ) ?? null);
  const unavailable = (status: Exclude<MovementItem["status"], "comparable">): MovementItem => ({
    ...item,
    status,
    providerId: current?.provider ?? providerId,
    current: evidence(current),
    baseline: evidence(baseline),
    changeUsd: null,
    changePercent: null,
    direction: null
  });
  if (current === null || current.lowestAsk === null) return unavailable("missing_current");
  const currentQuality = quality(current, now);
  if (currentQuality !== "fresh") return unavailable(`${currentQuality}_current`);
  if (baseline === null || baseline.lowestAsk === null) return unavailable("missing_baseline");
  const baselineQuality = quality(baseline, cutoff);
  if (baselineQuality !== "fresh") return unavailable(`${baselineQuality}_baseline`);
  if (baseline.lowestAsk === 0) return unavailable("zero_baseline");
  if (Date.parse(current.sourceUpdatedAt!) <= Date.parse(baseline.sourceUpdatedAt!))
    return unavailable("unchanged_source");
  const delta = cents(current.lowestAsk) - cents(baseline.lowestAsk);
  return {
    ...item,
    status: "comparable",
    providerId: current.provider,
    current: evidence(current)!,
    baseline: evidence(baseline)!,
    changeUsd: signedMoney(delta),
    changePercent: (Number(delta) / Number(cents(baseline.lowestAsk))) * 100,
    direction: delta > 0n ? "up" : delta < 0n ? "down" : "flat"
  };
}

export function summarizeMovement(
  items: MovementItem[]
): Pick<MovementReport, "summary" | "gainers" | "decliners"> {
  const comparable = items.filter(
    (item): item is ComparableMovement => item.status === "comparable"
  );
  const rank = (a: ComparableMovement, b: ComparableMovement, descending: boolean) => {
    // Rank by exact ratios, not rounded display percentages.
    const delta =
      (cents(a.current.lowestAsk!) - cents(a.baseline.lowestAsk!)) * cents(b.baseline.lowestAsk!) -
      (cents(b.current.lowestAsk!) - cents(b.baseline.lowestAsk!)) * cents(a.baseline.lowestAsk!);
    return (
      (delta === 0n ? 0 : delta > 0n ? (descending ? -1 : 1) : descending ? 1 : -1) ||
      a.marketHashName.localeCompare(b.marketHashName) ||
      a.itemId.localeCompare(b.itemId)
    );
  };
  const gainers = comparable
    .filter((item) => item.direction === "up")
    .sort((a, b) => rank(a, b, true));
  const decliners = comparable
    .filter((item) => item.direction === "down")
    .sort((a, b) => rank(a, b, false));
  return {
    summary: {
      watchedItems: items.length,
      comparableItems: comparable.length,
      excludedItems: items.length - comparable.length,
      up: gainers.length,
      down: decliners.length,
      flat: comparable.length - gainers.length - decliners.length
    },
    gainers: gainers.slice(0, 5),
    decliners: decliners.slice(0, 5)
  };
}
