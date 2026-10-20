import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { emptyPortfolio, movementFixture } from "./fixtures/market-overview";

const itemId = "00000000-0000-4000-8000-000000000201";
const marketHashName = "AK-47 | Redline (Field-Tested)";
const transfer = { version: 1, items: [marketHashName] };
const snapshot = {
  id: "00000000-0000-4000-8000-000000000301",
  itemId,
  provider: "steam",
  lowestAsk: 14.5,
  highestBid: null,
  askVolume: 10,
  bidVolume: null,
  currency: "USD",
  collectedAt: "2026-10-17T12:00:00.000Z",
  sourceUpdatedAt: "2026-10-15T12:00:00.000Z",
  freshness: "stale",
  isStale: true
};
const watchlist = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Default",
  items: [
    {
      id: "00000000-0000-4000-8000-000000000101",
      item: { id: itemId, marketHashName, imageUrl: null, createdAt: "2026-10-01T00:00:00.000Z" },
      latestSnapshots: [snapshot]
    }
  ]
};

test("watchlist transfer, skipped refreshes, and source freshness", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let imports = 0;
  await page.route("http://localhost:4000/portfolio**", (route) =>
    route.fulfill({ json: emptyPortfolio })
  );
  await page.route("http://localhost:4000/dashboard/movement**", (route) =>
    route.fulfill({
      json: {
        ...movementFixture(),
        items: [
          {
            itemId,
            marketHashName,
            status: "stale_current",
            providerId: "steam",
            current: snapshot,
            baseline: null,
            changeUsd: null,
            changePercent: null,
            direction: null
          }
        ],
        gainers: [],
        decliners: [],
        summary: { watchedItems: 1, comparableItems: 0, excludedItems: 1, up: 0, down: 0, flat: 0 }
      }
    })
  );
  await page.route("**/watchlists/default**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
          "access-control-allow-headers": "Content-Type"
        }
      });
      return;
    }
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/import")) {
      imports += 1;
      expect(route.request().postDataJSON()).toEqual(transfer);
      if (imports === 1) {
        await route.fulfill({
          status: 400,
          json: { message: "Watchlist can contain at most 1000 items; no items were added" }
        });
      } else {
        await route.fulfill({ json: { added: 0, skipped: 1, total: 1 } });
      }
    } else if (path.endsWith("/export")) {
      await route.fulfill({ json: transfer });
    } else if (path.endsWith("/refresh")) {
      await route.fulfill({
        json: {
          requestedItems: 1,
          snapshotsCreated: 0,
          remainingMonthlyBudget: 999,
          failedItems: 0,
          itemResults: [
            {
              itemId,
              marketHashName,
              status: "skipped",
              snapshotsCreated: 0,
              errorMessage: "Item refresh cooldown is active; cached prices retained"
            }
          ]
        }
      });
    } else if (path.endsWith("/history")) {
      await route.fulfill({
        json: {
          item: watchlist.items[0]!.item,
          snapshots: [
            {
              ...snapshot,
              id: "00000000-0000-4000-8000-000000000302",
              collectedAt: "2026-10-16T12:00:00.000Z",
              lowestAsk: 13
            },
            snapshot
          ]
        }
      });
    } else {
      await route.fulfill({ json: watchlist });
    }
  });
  await page.goto("/");
  await expect(
    page
      .getByRole("region", { name: "Watchlist", exact: true })
      .getByText(marketHashName, { exact: true })
  ).toBeVisible();
  await expect(page.getByText("Stale", { exact: true })).toBeVisible();
  await expect(page.getByText("steam: $14.50", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.screenshot({ path: testInfo.outputPath("watchlist.png"), fullPage: true });

  await page.getByRole("button", { name: "Refresh Prices" }).click();
  await expect(page.getByRole("status")).toContainText("1 skipped");
  await expect(page.getByRole("status")).toContainText("cooldown");

  await page.locator('input[type="file"]').setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("invalid json")
  });
  await expect(page.getByRole("status")).toContainText("valid JSON");
  expect(imports).toBe(0);
  await page.locator('input[type="file"]').setInputFiles({
    name: "watchlist.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(transfer))
  });
  await expect(page.getByRole("status")).toContainText("at most 1000 items; no items were added");
  await page.locator('input[type="file"]').setInputFiles({
    name: "watchlist.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(transfer))
  });
  await expect(page.getByRole("status")).toContainText("0 items; 1 duplicates skipped");
  expect(imports).toBe(2);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Watchlist" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("cs-skin-tracker-watchlist.json");
  expect(JSON.parse(await readFile(await download.path(), "utf8"))).toEqual(transfer);
  await page.getByRole("link", { name: "View", exact: true }).click();
  await expect(page.getByRole("heading", { name: marketHashName, exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Lowest ask price trend by provider" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.screenshot({ path: testInfo.outputPath("item-detail.png"), fullPage: true });
  expect(errors).toEqual([]);
});
