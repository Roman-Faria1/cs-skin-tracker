import type { MovementItem, PriceSnapshot } from "@csst/shared";
import { describe, expect, it } from "vitest";
import { compareItem, summarizeMovement } from "../src/dashboard/movement.js";

const now = new Date("2026-10-18T12:00:00Z");
const cutoff = new Date("2026-10-17T12:00:00Z");
const item = { itemId: "00000000-0000-4000-8000-000000000201", marketHashName: "Test Skin" };
const current: PriceSnapshot = {
  id: "00000000-0000-4000-8000-000000000301",
  itemId: item.itemId,
  provider: "steam",
  lowestAsk: 11,
  highestBid: null,
  askVolume: 1,
  bidVolume: null,
  currency: "USD",
  collectedAt: now.toISOString(),
  sourceUpdatedAt: now.toISOString(),
  freshness: "fresh",
  isStale: false
};
const baseline = {
  ...current,
  id: "00000000-0000-4000-8000-000000000302",
  lowestAsk: 10,
  collectedAt: cutoff.toISOString(),
  sourceUpdatedAt: cutoff.toISOString()
};
function compare(
  latest: PriceSnapshot[] = [current],
  history: PriceSnapshot[] = [baseline],
  provider: string | null = null
) {
  return compareItem(item, latest, history, now, cutoff, provider);
}

describe("cached movement comparisons", () => {
  it("calculates exact cent changes and classifies zero/down/up", () => {
    expect(compare()).toMatchObject({
      status: "comparable",
      direction: "up",
      changeUsd: "1.00",
      changePercent: 10
    });
    expect(compare([{ ...current, lowestAsk: 10 }])).toMatchObject({
      direction: "flat",
      changeUsd: "0.00",
      changePercent: 0
    });
    expect(compare([{ ...current, lowestAsk: 0 }])).toMatchObject({
      direction: "down",
      changeUsd: "-10.00",
      changePercent: -100
    });
    expect(
      compare([{ ...current, lowestAsk: 0.3 }], [{ ...baseline, lowestAsk: 0.1 }])
    ).toMatchObject({ changeUsd: "0.20", changePercent: 200 });
  });
  it("never treats a change in cheapest market as a price jump", () => {
    const result = compare(
      [current, { ...current, provider: "skinport", lowestAsk: 9 }],
      [baseline, { ...baseline, provider: "skinport", lowestAsk: 9 }]
    );
    expect(result).toMatchObject({ providerId: "skinport", direction: "flat" });
    expect(compare([current, { ...current, provider: "skinport", lowestAsk: 9 }])).toMatchObject({
      providerId: "skinport",
      status: "missing_baseline"
    });
    expect(
      compare([current, { ...current, provider: "skinport", lowestAsk: 9 }], [baseline], "steam")
        .changePercent
    ).toBe(10);
  });
  it.each([
    ["missing_current", { lowestAsk: null }],
    ["stale_current", { collectedAt: "2026-10-16T12:00:00Z" }],
    ["unknown_current", { sourceUpdatedAt: null }],
    ["invalid_current", { sourceUpdatedAt: "2026-10-19T12:00:00Z" }],
    ["invalid_current", { collectedAt: "2026-10-19T12:00:00Z" }]
  ] as const)("excludes %s rather than reporting flat movement", (status, change) => {
    expect(compare([{ ...current, ...change }])).toMatchObject({
      status,
      direction: null,
      changePercent: null,
      changeUsd: null
    });
  });
  it.each([
    ["missing_baseline", { lowestAsk: null }],
    ["stale_baseline", { sourceUpdatedAt: "2026-10-15T12:00:00Z" }],
    ["unknown_baseline", { sourceUpdatedAt: null }],
    ["invalid_baseline", { sourceUpdatedAt: now.toISOString() }],
    ["zero_baseline", { lowestAsk: 0 }]
  ] as const)("excludes %s evidence", (status, change) => {
    expect(compare([current], [{ ...baseline, ...change }])).toMatchObject({
      status,
      direction: null
    });
  });
  it("distinguishes absent cache from missing history and unchanged source dates", () => {
    expect(compare([]).status).toBe("missing_current");
    expect(compare([current], []).status).toBe("missing_baseline");
    expect(compare([{ ...current, sourceUpdatedAt: baseline.sourceUpdatedAt }]).status).toBe(
      "unchanged_source"
    );
    expect(compare([{ ...current, itemId: "unrelated" }]).status).toBe("missing_current");
  });
  it("ranks exact ratios, limits each list to five and retains all coverage counts", () => {
    const moves: MovementItem[] = Array.from({ length: 8 }, (_, i) =>
      compareItem(
        { itemId: item.itemId, marketHashName: `Skin ${i}` },
        [{ ...current, lowestAsk: 11 + i }],
        [baseline],
        now,
        cutoff,
        null
      )
    );
    moves.push(
      compare([{ ...current, lowestAsk: 8 }]),
      compare([{ ...current, lowestAsk: 10 }]),
      compare([], [])
    );
    const report = summarizeMovement(moves);
    expect(report.summary).toEqual({
      watchedItems: 11,
      comparableItems: 10,
      excludedItems: 1,
      up: 8,
      down: 1,
      flat: 1
    });
    expect(report.gainers).toHaveLength(5);
    expect(report.gainers[0]?.marketHashName).toBe("Skin 7");
    expect(report.decliners[0]?.changePercent).toBe(-20);
    const tiny = compare(
      [{ ...current, lowestAsk: 10000000 }],
      [{ ...baseline, lowestAsk: 9999999.99 }]
    );
    expect(tiny.direction).toBe("up");
    expect(tiny.changePercent).toBeGreaterThan(0);
  });
  it("orders ties deterministically and does not rank flat or unavailable data", () => {
    const move = compare();
    const report = summarizeMovement([
      { ...move, marketHashName: "Zulu" },
      { ...move, marketHashName: "Alpha" },
      compare([{ ...current, lowestAsk: 10 }])
    ]);
    expect(report.gainers.map((row) => row.marketHashName)).toEqual(["Alpha", "Zulu"]);
    expect(report.decliners).toEqual([]);
    expect(summarizeMovement([]).summary.watchedItems).toBe(0);
  });
  it("does not tie different ratios just because both display as one percent", () => {
    const lower = {
      ...compare([{ ...current, lowestAsk: 101.01 }], [{ ...baseline, lowestAsk: 100.01 }]),
      marketHashName: "Alpha"
    };
    const higher = {
      ...compare([{ ...current, lowestAsk: 101 }], [{ ...baseline, lowestAsk: 100 }]),
      marketHashName: "Zulu"
    };
    expect(summarizeMovement([lower, higher]).gainers.map((row) => row.marketHashName)).toEqual([
      "Zulu",
      "Alpha"
    ]);
  });
});
