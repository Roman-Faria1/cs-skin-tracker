// @vitest-environment node
import { expect, it } from "vitest";
import { formatPortfolioMoney } from "./portfolio";

it("formats decimal money without converting totals to floating point", () => {
  expect(formatPortfolioMoney("19999999999980000.01")).toBe("$19,999,999,999,980,000.01");
  expect(formatPortfolioMoney("-1234.05")).toBe("-$1,234.05");
  expect(formatPortfolioMoney("0.00")).toBe("$0.00");
  expect(formatPortfolioMoney(null)).toBe("Unavailable");
});
