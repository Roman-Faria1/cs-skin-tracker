import { describe, expect, it } from "vitest";

import { normalizeMarketHashName } from "../src/watchlists/watchlists.repository.js";
import { parseNullablePrice } from "../src/watchlists/watchlists.utils.js";

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
