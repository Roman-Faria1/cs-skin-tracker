import type { AlertRule, PriceSnapshot } from "@csst/shared";
import { describe, expect, it } from "vitest";
import { evaluateAlert } from "../src/alerts/alert-evaluator.js";

const now = new Date("2026-10-17T12:00:00Z");
const baseRule: AlertRule = {
  id: "00000000-0000-4000-8000-000000000101",
  itemId: "00000000-0000-4000-8000-000000000201",
  marketHashName: "AK-47 | Redline (Field-Tested)",
  kind: "price_below",
  threshold: 20,
  providerId: null,
  status: "active",
  generation: 1,
  createdAt: "2026-10-15T12:00:00Z",
  armedAt: "2026-10-15T12:00:00Z",
  triggeredAt: null,
  baselineSnapshot: null,
  lastEvaluatedAt: null,
  lastEvaluation: null
};
const baseQuote: PriceSnapshot = {
  id: "00000000-0000-4000-8000-000000000301",
  itemId: baseRule.itemId,
  provider: "steam",
  lowestAsk: 10,
  highestBid: null,
  askVolume: 1,
  bidVolume: null,
  currency: "USD",
  collectedAt: now.toISOString(),
  sourceUpdatedAt: now.toISOString(),
  freshness: "fresh",
  isStale: false
};
function evaluate(rule: Partial<AlertRule> = {}, quotes: Partial<PriceSnapshot>[] = [{}]) {
  return evaluateAlert(
    { ...baseRule, ...rule },
    quotes.map((quote) => ({ ...baseQuote, ...quote })),
    now
  );
}

describe("cached alert evaluator", () => {
  it("requires a price strictly below the threshold and honors provider scope", () => {
    expect(evaluate().matches).toBe(true);
    expect(evaluate({ threshold: 10 }).matches).toBe(false);
    expect(evaluate({ providerId: "csfloat" }).matches).toBe(false);
    expect(evaluate({}, [{ itemId: "another-item" }]).matches).toBe(false);
  });
  it.each(["paused", "triggered"] as const)("does not evaluate %s rules", (status) => {
    expect(evaluate({ status }).matches).toBe(false);
  });
  it("waits for usable data and legacy thresholds rather than firing on missing values", () => {
    expect(evaluate({}, []).observedValue).toBeNull();
    expect(evaluate({}, [{ lowestAsk: null }]).matches).toBe(false);
    expect(evaluate({ threshold: null }).message).toContain("threshold");
  });
  it.each([
    { sourceUpdatedAt: "2026-10-15T12:00:00Z" },
    { collectedAt: "2026-10-15T12:00:00Z" },
    { sourceUpdatedAt: null },
    { sourceUpdatedAt: "2026-10-18T12:00:00Z" },
    { collectedAt: "2026-10-18T12:00:00Z" }
  ])("recomputes freshness and excludes stale, unknown, or future price evidence", (quote) => {
    expect(evaluate({}, [quote]).matches).toBe(false);
  });
  it("uses integer cents at spread boundaries and requires two providers", () => {
    expect(
      evaluate({ kind: "provider_spread", threshold: 0.2 }, [
        { provider: "steam", lowestAsk: 0.3 },
        { provider: "csfloat", lowestAsk: 0.1 }
      ])
    ).toMatchObject({ matches: true, observedValue: 0.2 });
    expect(evaluate({ kind: "provider_spread", threshold: 1 }).matches).toBe(false);
    expect(
      evaluate({ kind: "provider_spread", threshold: 1 }, [
        {},
        { provider: "csfloat", sourceUpdatedAt: null, lowestAsk: 100 }
      ]).matches
    ).toBe(false);
  });
  it.each([105, 95])(
    "fires percent change in either direction at exactly five percent (%s)",
    (price) => {
      expect(
        evaluate(
          {
            kind: "percent_change",
            providerId: "steam",
            threshold: 5,
            baselineSnapshot: {
              ...baseQuote,
              lowestAsk: 100,
              collectedAt: "2026-10-17T11:00:00Z",
              sourceUpdatedAt: "2026-10-17T11:00:00Z"
            }
          },
          [{ lowestAsk: price }]
        ).matches
      ).toBe(true);
    }
  );
  it("does not round a smaller percent change into a match or reuse an unchanged source", () => {
    const baselineSnapshot = {
      ...baseQuote,
      lowestAsk: 100,
      collectedAt: "2026-10-17T11:00:00Z",
      sourceUpdatedAt: "2026-10-17T11:00:00Z"
    };
    const rule = {
      kind: "percent_change" as const,
      providerId: "steam",
      threshold: 5,
      baselineSnapshot
    };
    expect(evaluate(rule, [{ lowestAsk: 104.99 }]).matches).toBe(false);
    expect(
      evaluate(rule, [{ lowestAsk: 120, sourceUpdatedAt: baselineSnapshot.sourceUpdatedAt }])
        .matches
    ).toBe(false);
    expect(
      evaluate({ ...rule, baselineSnapshot: { ...baselineSnapshot, lowestAsk: 0 } }).matches
    ).toBe(false);
  });
  it("detects old source data even if collected recently", () => {
    expect(
      evaluate({ kind: "stale_data", threshold: 24 }, [{ sourceUpdatedAt: "2026-10-16T12:00:00Z" }])
    ).toMatchObject({ matches: true, observedValue: 24 });
  });
  it("uses collection time for unknown sources and arming time when no cache exists", () => {
    expect(
      evaluate({ kind: "stale_data", threshold: 24 }, [
        { sourceUpdatedAt: null, collectedAt: "2026-10-16T12:00:00Z" }
      ]).matches
    ).toBe(true);
    expect(
      evaluate({ kind: "stale_data", threshold: 24, armedAt: "2026-10-17T11:00:00Z" }, []).matches
    ).toBe(false);
    expect(evaluate({ kind: "stale_data", threshold: 24 }, [])).toMatchObject({
      matches: true,
      observedValue: 48,
      snapshots: []
    });
  });
});
