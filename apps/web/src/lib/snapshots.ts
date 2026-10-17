import type { PriceSnapshot } from "@csst/shared";

export function getLatestSnapshotsByProvider(snapshots: PriceSnapshot[]): PriceSnapshot[] {
  const latest = new Map<string, PriceSnapshot>();
  for (const snapshot of snapshots) {
    const current = latest.get(snapshot.provider);
    if (current === undefined || compareCollectedAtDesc(snapshot, current) < 0)
      latest.set(snapshot.provider, snapshot);
  }
  return [...latest.values()].sort(compareCollectedAtDesc);
}

function compareCollectedAtDesc(left: PriceSnapshot, right: PriceSnapshot): number {
  return (
    Date.parse(right.collectedAt) - Date.parse(left.collectedAt) || right.id.localeCompare(left.id)
  );
}

export function getFreshnessLabel(snapshot: PriceSnapshot): string {
  return snapshot.freshness === "unknown"
    ? "Source time unknown"
    : snapshot.freshness === "stale"
      ? "Stale"
      : "Fresh";
}

export function getLowestFreshAsk(snapshots: PriceSnapshot[]): number | null {
  const prices = getLatestSnapshotsByProvider(snapshots)
    .filter((snapshot) => snapshot.freshness === "fresh")
    .map((snapshot) => snapshot.lowestAsk)
    .filter((price): price is number => price !== null);
  return prices.length === 0 ? null : Math.min(...prices);
}
