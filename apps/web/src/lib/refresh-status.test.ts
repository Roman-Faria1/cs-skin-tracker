// @vitest-environment node
import { expect, it } from "vitest";
import { getRefreshStatusMessage } from "./refresh-status";

it("explains skipped refreshes instead of claiming prices were refreshed", () => {
  const message = getRefreshStatusMessage({
    requestedItems: 1,
    snapshotsCreated: 0,
    failedItems: 0,
    remainingMonthlyBudget: 25,
    itemResults: [
      {
        itemId: "00000000-0000-4000-8000-000000000001",
        marketHashName: "AK-47 | Redline",
        status: "skipped",
        snapshotsCreated: 0,
        errorMessage: "Item refresh cooldown is active"
      }
    ]
  });
  expect(message).toContain("1 skipped");
  expect(message).toContain("cooldown is active");
  expect(message).not.toContain("Refresh complete");
});
