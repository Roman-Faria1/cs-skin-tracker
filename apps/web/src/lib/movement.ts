import type { MovementItem } from "@csst/shared";

export function formatMovementPercent(value: number): string {
  if (value === 0) return "0.00%";
  const sign = value > 0 ? "+" : "-";
  if (Math.abs(value) >= 10000)
    return `${sign}${Math.abs(value).toExponential(1).replace("e+", "e")}%`;
  return `${sign}${Math.abs(value) < 0.01 ? "<0.01" : Math.abs(value).toFixed(2)}%`;
}
export const movementQualityLabels: Record<MovementItem["status"], string> = {
  comparable: "Comparable",
  missing_current: "No current ask",
  stale_current: "Current quote stale",
  unknown_current: "Current source unknown",
  invalid_current: "Invalid current quote",
  missing_baseline: "No baseline ask",
  stale_baseline: "Baseline stale",
  unknown_baseline: "Baseline source unknown",
  invalid_baseline: "Invalid baseline quote",
  zero_baseline: "Zero baseline price",
  unchanged_source: "No newer source quote"
};
