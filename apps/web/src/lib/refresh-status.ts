import type { RefreshWatchlistResponse } from "@csst/shared";

export function getRefreshStatusMessage(result: RefreshWatchlistResponse): string {
  const skipped = result.itemResults.filter((item) => item.status === "skipped");
  const failures = result.itemResults.filter((item) => item.status === "failed");
  const notes = [...new Set(skipped.map((item) => item.errorMessage).filter(Boolean))].join("; ");
  const failedNames = failures
    .slice(0, 3)
    .map((item) => item.marketHashName)
    .join(", ");
  return [
    `${result.snapshotsCreated} snapshots saved.`,
    failures.length > 0 ? `${failures.length} failed: ${failedNames}.` : "",
    skipped.length > 0 ? `${skipped.length} skipped. ${notes}.` : "",
    `Remaining monthly budget: ${result.remainingMonthlyBudget ?? "unknown"}.`,
    result.alertEvaluation?.triggered
      ? `${result.alertEvaluation.triggered} alerts triggered.`
      : "",
    result.alertEvaluation?.error ?? ""
  ]
    .filter(Boolean)
    .join(" ");
}
