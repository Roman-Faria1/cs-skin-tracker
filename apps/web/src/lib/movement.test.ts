// @vitest-environment node
import { expect, it } from "vitest";
import { formatMovementPercent } from "./movement";
it("preserves tiny movement direction instead of rounding it to flat", () => {
  expect(formatMovementPercent(0.0001)).toBe("+<0.01%");
  expect(formatMovementPercent(-0.0001)).toBe("-<0.01%");
  expect(formatMovementPercent(0)).toBe("0.00%");
  expect(formatMovementPercent(12.345)).toBe("+12.35%");
  expect(formatMovementPercent(-20)).toBe("-20.00%");
  expect(formatMovementPercent(100000000000000)).toBe("+1.0e14%");
});
