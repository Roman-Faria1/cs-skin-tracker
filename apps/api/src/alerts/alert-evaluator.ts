import type { AlertRule, PriceSnapshot } from "@csst/shared";
import { getSnapshotFreshness } from "../watchlists/watchlists.utils.js";

export interface AlertDecision {
  matches: boolean;
  observedValue: number | null;
  message: string;
  snapshots: PriceSnapshot[];
}

export function isFreshQuote(snapshot: PriceSnapshot, now: Date): boolean {
  const collected = new Date(snapshot.collectedAt);
  const source = snapshot.sourceUpdatedAt === null ? null : new Date(snapshot.sourceUpdatedAt);
  return (
    collected <= now &&
    source !== null &&
    source <= now &&
    getSnapshotFreshness(collected, source, now) === "fresh"
  );
}

export function evaluateAlert(
  rule: AlertRule,
  latestSnapshots: PriceSnapshot[],
  now: Date
): AlertDecision {
  const waiting = (message: string): AlertDecision => ({
    matches: false,
    observedValue: null,
    message,
    snapshots: []
  });
  if (rule.status !== "active") return waiting("Rule is not active");
  if (rule.threshold === null) return waiting("Rule requires a threshold");
  const snapshots = latestSnapshots.filter(
    (snapshot) =>
      snapshot.itemId === rule.itemId &&
      (rule.providerId === null || snapshot.provider === rule.providerId)
  );

  if (rule.kind === "stale_data") {
    const time = (snapshot: PriceSnapshot) =>
      Math.min(
        Date.parse(snapshot.collectedAt),
        snapshot.sourceUpdatedAt === null ? Infinity : Date.parse(snapshot.sourceUpdatedAt)
      );
    const oldest = snapshots.slice().sort((left, right) => time(left) - time(right))[0];
    const age = Math.max(
      0,
      (now.getTime() - (oldest === undefined ? Date.parse(rule.armedAt) : time(oldest))) / 3600000
    );
    return {
      matches: age >= rule.threshold,
      observedValue: age,
      message:
        oldest === undefined
          ? `No cached quote for ${age.toFixed(1)} hours since arming`
          : `${oldest.provider} data age is ${age.toFixed(1)} hours`,
      snapshots: oldest === undefined ? [] : [oldest]
    };
  }

  const priced = snapshots
    .filter(
      (snapshot): snapshot is PriceSnapshot & { lowestAsk: number } =>
        snapshot.lowestAsk !== null && isFreshQuote(snapshot, now)
    )
    .sort((left, right) => left.lowestAsk - right.lowestAsk);
  const cheapest = priced[0];
  if (cheapest === undefined) return waiting("No fresh priced quotes available");
  const cents = (value: number) => Math.round(value * 100);

  if (rule.kind === "price_below") {
    return {
      matches: cents(cheapest.lowestAsk) < cents(rule.threshold),
      observedValue: cheapest.lowestAsk,
      message: `${cheapest.provider} lowest ask is $${cheapest.lowestAsk.toFixed(2)}`,
      snapshots: [cheapest]
    };
  }
  if (rule.kind === "provider_spread") {
    const highest = priced.at(-1);
    if (priced.length < 2 || highest === undefined || highest.provider === cheapest.provider)
      return waiting("At least two fresh priced providers are required");
    const spread = cents(highest.lowestAsk) - cents(cheapest.lowestAsk);
    return {
      matches: spread >= cents(rule.threshold),
      observedValue: spread / 100,
      message: `Lowest-ask spread is $${(spread / 100).toFixed(2)} (${cheapest.provider} to ${highest.provider})`,
      snapshots: [cheapest, highest]
    };
  }
  const baseline = rule.baselineSnapshot;
  if (
    baseline === null ||
    baseline.lowestAsk === null ||
    baseline.lowestAsk <= 0 ||
    baseline.provider !== cheapest.provider
  )
    return waiting("A positive baseline price from the selected provider is required");
  if (
    Date.parse(cheapest.collectedAt) <= Date.parse(baseline.collectedAt) ||
    Date.parse(cheapest.sourceUpdatedAt!) <=
      Date.parse(baseline.sourceUpdatedAt ?? baseline.collectedAt)
  )
    return waiting("Waiting for a newer source quote than the armed baseline");
  const base = cents(baseline.lowestAsk);
  const change = cents(cheapest.lowestAsk) - base;
  const percent = (change / base) * 100;
  return {
    matches: BigInt(Math.abs(change)) * 10000n >= BigInt(base) * BigInt(cents(rule.threshold)),
    observedValue: percent,
    message: `${cheapest.provider} price changed ${percent >= 0 ? "+" : ""}${percent.toFixed(2)}% since arming`,
    snapshots: [cheapest]
  };
}
