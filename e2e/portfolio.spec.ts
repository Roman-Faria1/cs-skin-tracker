import { expect, test } from "./support/owner-test";
import type { Holding, HoldingInput, Portfolio, PriceSnapshot, ValuedHolding } from "@csst/shared";

const itemId = "00000000-0000-4000-8000-000000000201";
const otherId = "00000000-0000-4000-8000-000000000202";
const lotId = "00000000-0000-4000-8000-000000000301";
const marketHashName = "AK-47 | Redline (Field-Tested)";
const otherName = "AWP | Asiimov (Field-Tested)";
const at = "2026-10-17T12:00:00.000Z";
const quote: PriceSnapshot = {
  id: "00000000-0000-4000-8000-000000000401",
  itemId,
  provider: "steam",
  lowestAsk: 10,
  highestBid: null,
  askVolume: 1,
  bidVolume: null,
  currency: "USD",
  collectedAt: at,
  sourceUpdatedAt: at,
  freshness: "fresh",
  isStale: false
};

function racePortfolio(quantity: number, providerId: string | null = null): Portfolio {
  return {
    asOf: at,
    providerId,
    providers: [{ id: "steam", name: "Steam" }],
    holdings: [
      {
        id: lotId,
        itemId,
        marketHashName,
        quantity,
        acquisitionPrice: 5,
        notes: null,
        isWatched: true,
        createdAt: at,
        updatedAt: at,
        valuationStatus: "fresh",
        quote,
        unitPrice: "10.00",
        costBasis: (quantity * 5).toFixed(2),
        marketValue: (quantity * 10).toFixed(2),
        unrealizedPnl: (quantity * 5).toFixed(2)
      }
    ],
    summary: {
      holdingCount: 1,
      totalQuantity: quantity,
      valuedHoldings: 1,
      unvaluedHoldings: 0,
      unknownCostHoldings: 0,
      pnlHoldings: 1,
      valuationStatus: "complete",
      grossAskValue: (quantity * 10).toFixed(2),
      knownCostBasis: (quantity * 5).toFixed(2),
      pricedCostBasis: (quantity * 5).toFixed(2),
      unrealizedPnl: (quantity * 5).toFixed(2)
    }
  };
}

for (const [lateResult, marketSettled] of [
  ["success", false],
  ["failure", false],
  ["success", true],
  ["failure", true]
] as const) {
  test(`portfolio ignores superseded mount ${lateResult} with newer market load ${marketSettled ? "settled" : "pending"}`, async ({
    page
  }) => {
    let releaseInitial!: () => void;
    let releaseMarket!: () => void;
    const initial = new Promise<void>((resolve) => {
      releaseInitial = resolve;
    });
    const market = new Promise<void>((resolve) => {
      releaseMarket = resolve;
    });
    let reads = 0;
    let watchlistReads = 0;
    await page.route("**/watchlists/default", async (route) => {
      const revision = ++watchlistReads;
      await route.fulfill({
        json: {
          id: "00000000-0000-4000-8000-000000000001",
          name: "Default",
          items: [
            {
              id: "00000000-0000-4000-8000-000000000101",
              item: {
                id: itemId,
                marketHashName: `Watchlist revision ${revision}`,
                imageUrl: null,
                createdAt: at
              },
              latestSnapshots: []
            }
          ]
        }
      });
    });
    await page.route("**/api/portfolio**", async (route) => {
      const revision = ++reads;
      if (revision === 1) {
        await initial;
        if (lateResult === "failure") {
          await route.fulfill({ status: 503, json: { message: "Obsolete initial failure" } });
          return;
        }
        await route.fulfill({ json: racePortfolio(1) });
        return;
      }
      if (revision === 3) {
        await market;
        await route.fulfill({ json: racePortfolio(4, "steam") });
        return;
      }
      await route.fulfill({ json: racePortfolio(2) });
    });
    try {
      await page.goto("/portfolio");
      await expect.poll(() => reads).toBe(1);
      await expect.poll(() => watchlistReads).toBe(1);
      await page.getByRole("button", { name: "Reload Cache" }).click();
      const metrics = page.locator(".portfolio-summary");
      await expect(metrics).toContainText("$20.00");
      await expect(
        page
          .getByLabel("Item", { exact: true })
          .getByRole("option", { name: "Watchlist revision 2" })
      ).toHaveCount(1);

      await page.getByLabel("Valuation Market").selectOption("steam");
      await expect.poll(() => reads).toBe(3);
      await expect(page.getByRole("button", { name: "Reload Cache" })).toBeDisabled();
      if (marketSettled) {
        releaseMarket();
        await expect(metrics).toContainText("$40.00");
        await expect(page.getByLabel("Valuation Market")).toHaveValue("steam");
      }
      const oldResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/portfolio" && !new URL(response.url()).search
      );
      releaseInitial();
      await (await oldResponse).finished();
      // Let fetch parsing and React commits settle without a wall-clock delay.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      await expect(metrics).toContainText(marketSettled ? "$40.00" : "$20.00");
      await expect(
        page
          .getByLabel("Item", { exact: true })
          .getByRole("option", { name: `Watchlist revision ${marketSettled ? 3 : 2}` })
      ).toHaveCount(1);
      await expect(page.getByRole("status")).not.toContainText("Obsolete initial failure");
      await expect(page.getByRole("button", { name: "Reload Cache" })).toBeEnabled({
        enabled: marketSettled
      });
      await expect(page.getByLabel("Valuation Market")).toBeEnabled({ enabled: marketSettled });

      releaseMarket();
      await expect(metrics).toContainText("$40.00");
      await expect(page.getByLabel("Valuation Market")).toHaveValue("steam");
      await expect(page.getByLabel("Valuation Market")).toBeEnabled();
      await expect(page.getByRole("button", { name: "Reload Cache" })).toBeEnabled();
      await expect(
        page
          .getByLabel("Item", { exact: true })
          .getByRole("option", { name: "Watchlist revision 3" })
      ).toHaveCount(1);
      await expect(page.getByRole("status")).not.toContainText("Obsolete initial failure");
    } finally {
      releaseInitial();
      releaseMarket();
    }
  });
}

test("portfolio lots, partial valuation, providers and recoverable failures", async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let lot: Holding | null = null;
  let isWatched = false;
  let failRead = true;
  let failCreate = true;
  let failAfterEdit = true;
  let refreshes = 0;
  await page.route("**/watchlists/default**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "Content-Type"
        }
      });
      return;
    }
    if (new URL(route.request().url()).pathname.endsWith("/refresh")) refreshes += 1;
    if (route.request().method() === "POST") isWatched = true;
    await route.fulfill({
      json: {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Default",
        items: [
          {
            id: "00000000-0000-4000-8000-000000000101",
            item: { id: itemId, marketHashName, imageUrl: null, createdAt: at },
            latestSnapshots: [quote]
          },
          ...(isWatched
            ? [
                {
                  id: "00000000-0000-4000-8000-000000000102",
                  item: { id: otherId, marketHashName: otherName, imageUrl: null, createdAt: at },
                  latestSnapshots: []
                }
              ]
            : [])
        ]
      }
    });
  });
  await page.route("**/api/portfolio**", async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    if (method === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
          "access-control-allow-headers": "Content-Type"
        }
      });
      return;
    }
    if (method === "GET" && failRead) {
      failRead = false;
      await route.fulfill({ status: 503, json: { message: "Portfolio temporarily unavailable" } });
      return;
    }
    if (method === "POST" || method === "PUT") {
      const input = route.request().postDataJSON() as HoldingInput;
      if (method === "POST" && failCreate) {
        failCreate = false;
        await route.fulfill({ status: 400, json: { message: "Holding could not be saved" } });
        return;
      }
      expect(input.itemId).toBe(itemId);
      lot = { ...input, id: lotId, marketHashName, isWatched: true, createdAt: at, updatedAt: at };
      if (method === "PUT" && failAfterEdit) {
        failAfterEdit = false;
        failRead = true;
      }
      await route.fulfill({ json: lot });
      return;
    }
    if (method === "DELETE") {
      lot = null;
      await route.fulfill({ json: { removed: true } });
      return;
    }

    const providerId = url.searchParams.get("providerId");
    const unavailable = providerId === "skinport";
    const stale: ValuedHolding = {
      id: "00000000-0000-4000-8000-000000000302",
      itemId: otherId,
      marketHashName: otherName,
      quantity: 1,
      acquisitionPrice: 5,
      notes: "Older lot",
      isWatched,
      createdAt: at,
      updatedAt: at,
      valuationStatus: "stale",
      quote: {
        ...quote,
        itemId: otherId,
        sourceUpdatedAt: "2026-10-15T12:00:00.000Z",
        freshness: "stale",
        isStale: true
      },
      unitPrice: null,
      costBasis: "5.00",
      marketValue: null,
      unrealizedPnl: null
    };
    const cost = lot ? lot.quantity * (lot.acquisitionPrice ?? 0) : 0;
    const value = lot ? lot.quantity * 10 : 0;
    const portfolio: Portfolio = {
      asOf: at,
      providerId,
      providers: [
        { id: "steam", name: "Steam" },
        { id: "skinport", name: "Skinport" }
      ],
      holdings: [
        ...(lot
          ? [
              {
                ...lot,
                valuationStatus: unavailable ? ("stale" as const) : ("fresh" as const),
                quote: {
                  ...quote,
                  provider: unavailable ? "skinport" : "steam",
                  sourceUpdatedAt: unavailable ? "2026-10-15T12:00:00.000Z" : at
                },
                unitPrice: unavailable ? null : "10.00",
                costBasis: lot.acquisitionPrice === null ? null : cost.toFixed(2),
                marketValue: unavailable ? null : value.toFixed(2),
                unrealizedPnl:
                  unavailable || lot.acquisitionPrice === null ? null : (value - cost).toFixed(2)
              }
            ]
          : []),
        stale
      ],
      summary: {
        holdingCount: lot ? 2 : 1,
        totalQuantity: (lot?.quantity ?? 0) + 1,
        valuedHoldings: lot && !unavailable ? 1 : 0,
        unvaluedHoldings: lot && unavailable ? 2 : 1,
        unknownCostHoldings: lot && lot.acquisitionPrice === null ? 1 : 0,
        pnlHoldings: lot && lot.acquisitionPrice !== null && !unavailable ? 1 : 0,
        valuationStatus: lot && !unavailable ? "partial" : "unavailable",
        grossAskValue: lot && !unavailable ? value.toFixed(2) : null,
        knownCostBasis: (cost + 5).toFixed(2),
        pricedCostBasis:
          lot && lot.acquisitionPrice !== null && !unavailable ? cost.toFixed(2) : null,
        unrealizedPnl:
          lot && lot.acquisitionPrice !== null && !unavailable ? (value - cost).toFixed(2) : null
      }
    };
    await route.fulfill({ json: portfolio });
  });

  await page.goto("/portfolio");
  await expect(page.getByRole("status")).toContainText("Portfolio temporarily unavailable");
  await page.getByRole("button", { name: "Reload Cache" }).click();
  await expect(page.getByText("Unwatched: scheduled collection stopped")).toBeVisible();
  await expect(page.getByText("Unavailable", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Item", { exact: true }).selectOption(itemId);
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByLabel("Acquisition / Skin (USD)").fill("8.25");
  await page.getByLabel("Notes", { exact: true }).fill("Main lot");
  await page.getByRole("button", { name: "Add Holding" }).click();
  await expect(page.getByRole("status")).toHaveText("Holding could not be saved");
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("2");
  await page.getByRole("button", { name: "Add Holding" }).click();
  await expect(page.getByRole("status")).toHaveText("Holding added.");
  const metrics = page.locator(".portfolio-summary");
  await expect(metrics).toContainText("$20.00");
  await expect(metrics).toContainText("$21.50");
  await expect(metrics).toContainText("$3.50");
  await expect(metrics).toContainText("1 / 2 lots");
  await expect(page.getByText("partial", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.screenshot({ path: testInfo.outputPath("portfolio.png"), fullPage: true });
  await page.getByLabel("Valuation Market").selectOption("skinport");
  await expect(metrics).toContainText("0 / 2 lots");
  await expect(metrics.getByText("Unavailable", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Valuation Market").selectOption("");
  await expect(metrics).toContainText("1 / 2 lots");
  await page.getByRole("button", { name: `Edit holding ${marketHashName}` }).click();
  await page.getByLabel("Quantity", { exact: true }).fill("3");
  await page.getByLabel("Acquisition / Skin (USD)").fill("0");
  await page.getByRole("button", { name: "Save Holding" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Holding updated. Cached view could not reload"
  );
  await expect(page.getByRole("button", { name: "Add Holding" })).toBeVisible();
  await page.getByRole("button", { name: "Reload Cache" }).click();
  await expect(metrics).toContainText("$30.00");
  await expect(page.getByRole("row", { name: /Main lot/ })).toContainText("$0.00");
  await page.getByRole("button", { name: `Watch ${otherName}` }).click();
  await expect(page.getByRole("status")).toHaveText("Item watched.");
  await expect(page.getByText("Unwatched: scheduled collection stopped")).toHaveCount(0);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: `Delete holding ${marketHashName}` }).click();
  await expect(page.getByRole("status")).toHaveText("Holding deleted.");
  await expect(page.getByRole("heading", { name: "Holdings (1)" })).toBeVisible();
  expect(refreshes).toBe(0);
  expect(errors).toEqual([]);
});
