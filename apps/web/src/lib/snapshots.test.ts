// @vitest-environment node
import type { PriceSnapshot } from "@csst/shared";
import { expect, it } from "vitest";
import { getLatestSnapshotsByProvider, getLowestFreshAsk } from "./snapshots";

function snapshot(
  provider: string,
  price: number | null,
  collectedAt: string,
  freshness: PriceSnapshot["freshness"] = "fresh"
): PriceSnapshot {
  return {
    id: `${provider}-${collectedAt}`,
    itemId: "item",
    provider,
    lowestAsk: price,
    highestBid: null,
    askVolume: null,
    bidVolume: null,
    currency: "USD",
    sourceUpdatedAt: null,
    collectedAt,
    freshness,
    isStale: freshness === "stale"
  };
}

it("selects latest prices independently of response ordering and leaves input intact", () => {
  const recent = snapshot("steam", 25, "2026-10-17T12:00:00Z");
  const older = snapshot("steam", 1, "2026-10-16T12:00:00Z");
  const other = snapshot("csfloat", 20, "2026-10-17T11:00:00Z");
  const input = [older, recent, other];
  expect(getLatestSnapshotsByProvider(input)).toEqual([recent, other]);
  expect(input).toEqual([older, recent, other]);
});

it("excludes stale, unknown, and superseded quotes from the lowest fresh ask", () => {
  expect(
    getLowestFreshAsk([
      snapshot("steam", 5, "2026-10-17T10:00:00Z"),
      snapshot("steam", null, "2026-10-17T12:00:00Z"),
      snapshot("skinport", 1, "2026-10-17T12:00:00Z", "stale"),
      snapshot("csmoney_m", 2, "2026-10-17T12:00:00Z", "unknown"),
      snapshot("csfloat", 20, "2026-10-17T12:00:00Z")
    ])
  ).toBe(20);
  expect(getLowestFreshAsk([])).toBeNull();
});
