import { describe, expect, it } from "vitest";

import { normalizeMarketHashName } from "../src/watchlists/watchlists.repository.js";
import { getSnapshotFreshness, parseNullablePrice } from "../src/watchlists/watchlists.utils.js";

describe("watchlist utilities", () => {
  it("normalizes market hash names for case-insensitive dedupe", () => {
    expect(normalizeMarketHashName("  AK-47   | Redline (Field-Tested) ")).toBe(
      "ak-47 | redline (field-tested)"
    );
  });

  it("prefers decimal price fields over minor-unit fields", () => {
    expect(parseNullablePrice(12345, "120.15")).toBe(120.15);
  });

  it("converts minor-unit prices to decimal dollars", () => {
    expect(parseNullablePrice(12345, null)).toBe(123.45);
  });
});

describe("source freshness", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const old = new Date("2026-10-15T12:00:00Z");
  it("does not make an old source quote fresh by collecting it again", () => {
    expect(getSnapshotFreshness(now, old, now)).toBe("stale");
  });
  it("marks recently collected quotes with no source time as unknown", () => {
    expect(getSnapshotFreshness(now, null, now)).toBe("unknown");
  });
  it("marks old cached quotes as stale even without a source time", () => {
    expect(getSnapshotFreshness(old, null, now)).toBe("stale");
  });
  it("requires both source and collection times to be recent", () => {
    expect(getSnapshotFreshness(old, now, now)).toBe("stale");
    expect(getSnapshotFreshness(now, now, now)).toBe("fresh");
  });
});
