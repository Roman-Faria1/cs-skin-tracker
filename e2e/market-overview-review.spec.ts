import { expect, test } from "./support/owner-test";
import { emptyPortfolio, movementFixture } from "./fixtures/market-overview";

const watchlist = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Default",
  items: movementFixture().items.map((item, index) => ({
    id: `00000000-0000-4000-8000-00000000010${index}`,
    item: {
      id: item.itemId,
      marketHashName: item.marketHashName,
      imageUrl: null,
      createdAt: "2026-10-01T00:00:00.000Z"
    },
    latestSnapshots: item.current ? [item.current] : []
  }))
};

for (const [held, result] of [
  ["portfolio", "success"],
  ["portfolio", "empty"],
  ["portfolio", "failure"],
  ["movement", "success"],
  ["movement", "failure"]
] as const) {
  test(`overview publishes ${result} while ${held} is pending`, async ({ page }) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname.slice(4);
      const endpoint = path === "/portfolio" ? "portfolio" : "movement";
      if (path === "/portfolio" || path === "/dashboard/movement") {
        if (endpoint === held) await pending;
        else if (result === "failure") {
          await route.fulfill({ status: 503, json: { message: "Cache offline" } });
          return;
        }
        const movement = movementFixture();
        await route.fulfill({
          json:
            endpoint === "portfolio"
              ? emptyPortfolio
              : result === "empty"
                ? {
                    ...movement,
                    items: [],
                    gainers: [],
                    decliners: [],
                    summary: {
                      watchedItems: 0,
                      comparableItems: 0,
                      excludedItems: 0,
                      up: 0,
                      down: 0,
                      flat: 0
                    }
                  }
                : movement
        });
        return;
      }
      await route.fulfill({ json: watchlist });
    });
    try {
      await page.goto("/");
      const overview = page.getByRole("region", { name: "Market Overview", exact: true });
      const risers = overview.getByRole("region", { name: "Biggest Risers" });
      const portfolio = overview
        .getByText("Portfolio Gross Ask (USD)", { exact: true })
        .locator("..");
      if (result === "failure") {
        await expect(overview.getByRole("alert")).toHaveText(
          `${held === "portfolio" ? "Movement" : "Portfolio"}: Cache offline`
        );
        await expect(held === "portfolio" ? risers : portfolio).toContainText("Unavailable");
      } else if (held === "portfolio") {
        await expect(risers).toContainText(
          result === "empty" ? "No comparable risers" : "+100.00%"
        );
        await expect(overview.locator(".overview-metrics")).toContainText(
          result === "empty" ? "0 / 0" : "2 / 3"
        );
      } else {
        await expect(portfolio).toContainText("$0.00");
        await expect(portfolio).toContainText("complete");
      }
      await expect(held === "portfolio" ? portfolio : risers).toContainText("Loading...");
      await expect(held === "portfolio" ? risers : portfolio).not.toContainText("Loading...");
      await expect(overview).toHaveAttribute("aria-busy", "true");
      release();
      await expect(overview).toHaveAttribute("aria-busy", "false");
    } finally {
      release();
    }
  });
}

for (const action of ["add", "remove", "import", "refresh"] as const) {
  test(`overview invalidates after ${action} even when the watchlist reload fails`, async ({
    page
  }) => {
    let release!: () => void;
    const obsolete = new Promise<void>((resolve) => {
      release = resolve;
    });
    let movementReads = 0;
    let written = false;
    const updated = movementFixture();
    const riser = updated.gainers[0]!;
    riser.current.lowestAsk = 40;
    riser.changeUsd = "30.00";
    riser.changePercent = 300;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname.slice(4);
      const method = route.request().method();
      if (method === "OPTIONS") {
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
      if (path === "/dashboard/movement") {
        const read = ++movementReads;
        if (read === 1) await obsolete;
        await route.fulfill({ json: read === 1 ? movementFixture() : updated });
        return;
      }
      if (path === "/portfolio") {
        await route.fulfill({ json: emptyPortfolio });
        return;
      }
      if (method === "POST" || method === "DELETE") {
        written = true;
        await route.fulfill({
          json: path.endsWith("/import")
            ? { added: 1, skipped: 0, total: 4 }
            : path.endsWith("/refresh")
              ? {
                  requestedItems: 0,
                  snapshotsCreated: 0,
                  remainingMonthlyBudget: 1000,
                  failedItems: 0,
                  itemResults: []
                }
              : {}
        });
        return;
      }
      await route.fulfill(
        written
          ? { status: 503, json: { message: "Watchlist cache offline" } }
          : { json: watchlist }
      );
    });
    try {
      await page.goto("/");
      await expect.poll(() => movementReads).toBe(1);
      if (action === "add") {
        await page.getByRole("textbox", { name: "Market hash name" }).fill("New Test Skin");
        await page.getByRole("button", { name: "Add Skin", exact: true }).click();
      } else if (action === "remove") {
        await page.getByRole("button", { name: "Remove", exact: true }).first().click();
      } else if (action === "import") {
        await page.getByLabel("Watchlist JSON file").setInputFiles({
          name: "watchlist.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify({ version: 1, items: ["New Test Skin"] }))
        });
      } else {
        await page.getByRole("button", { name: "Refresh Prices", exact: true }).click();
      }
      await expect(page.getByRole("status")).toHaveText("Failed to fetch watchlist: 503");
      expect(written).toBe(true);
      const overview = page.getByRole("region", { name: "Market Overview", exact: true });
      const risers = overview.getByRole("region", { name: "Biggest Risers" });
      await expect(risers).toContainText("+300.00%");
      await expect.poll(() => movementReads).toBe(2);
      const response = page.waitForResponse((value) =>
        value.url().endsWith("/dashboard/movement?window=24h")
      );
      release();
      await (await response).finished();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      await expect(risers).toContainText("+300.00%");
      await expect(overview.getByRole("alert")).toHaveCount(0);
      await expect(overview).toHaveAttribute("aria-busy", "false");
    } finally {
      release();
    }
  });
}
