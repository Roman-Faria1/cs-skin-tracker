import { expect, test } from "./support/owner-test";
import type { MovementWindow } from "@csst/shared";
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

test("market overview filters, coverage, cached refresh and independent failures", async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const queries: string[] = [];
  let failMovement = false;
  let failPortfolio = false;
  let refreshes = 0;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
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
    if (url.pathname === "/api/dashboard/movement") {
      queries.push(url.search);
      if (failMovement) {
        await route.fulfill({ status: 503, json: { message: "Movement cache offline" } });
        return;
      }
      await route.fulfill({
        json: movementFixture(
          url.searchParams.get("window") as MovementWindow,
          url.searchParams.get("providerId")
        )
      });
      return;
    }
    if (url.pathname === "/api/portfolio") {
      await route.fulfill(
        failPortfolio
          ? { status: 503, json: { message: "Portfolio cache offline" } }
          : { json: emptyPortfolio }
      );
      return;
    }
    if (url.pathname.endsWith("/refresh")) {
      refreshes += 1;
      await route.fulfill({
        json: {
          requestedItems: 0,
          snapshotsCreated: 0,
          remainingMonthlyBudget: 1000,
          failedItems: 0,
          itemResults: []
        }
      });
      return;
    }
    await route.fulfill({ json: watchlist });
  });
  await page.goto("/");
  const overview = page.getByRole("region", { name: "Market Overview", exact: true });
  await expect(overview.getByRole("region", { name: "Biggest Risers" })).toContainText("+100.00%");
  await expect(overview.getByRole("region", { name: "Biggest Fallers" })).toContainText("-20.00%");
  await expect(overview.locator(".overview-metrics")).toContainText("2 / 3");
  await expect(overview.locator(".overview-metrics")).toContainText("1 unavailable");
  expect(
    await overview.locator(".movers-table td:nth-child(2) strong").evaluateAll((labels) =>
      labels.every((label) => {
        const box = label.getBoundingClientRect();
        const cell = label.closest("td")!.getBoundingClientRect();
        return box.left >= cell.left && box.right <= cell.right;
      })
    )
  ).toBe(true);
  await overview.getByText("Comparison Details (3 skins)").click();
  await expect(overview.getByText("No baseline ask", { exact: true })).toBeVisible();
  await expect(overview.getByText("Source:", { exact: false }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.screenshot({ path: testInfo.outputPath("market-overview.png"), fullPage: true });
  await overview.getByRole("radio", { name: "7d", exact: true }).check();
  await expect(overview.getByRole("region", { name: "Biggest Risers" })).toContainText("+300.00%");
  await overview.getByLabel("Movement Market").selectOption("steam");
  await expect.poll(() => queries.at(-1)).toBe("?window=7d&providerId=steam");
  await expect(overview).toHaveAttribute("aria-busy", "false");
  failMovement = true;
  await overview.getByRole("button", { name: "Reload cached summary" }).click();
  await expect(overview.getByRole("alert")).toHaveText("Movement: Movement cache offline");
  await expect(overview.locator(".overview-metrics")).toContainText("$0.00");
  failMovement = false;
  failPortfolio = true;
  await overview.getByRole("button", { name: "Reload cached summary" }).click();
  await expect(overview.getByRole("alert")).toHaveText("Portfolio: Portfolio cache offline");
  await expect(overview.getByRole("region", { name: "Biggest Risers" })).toContainText("+300.00%");
  failPortfolio = false;
  const before = queries.length;
  await page.getByRole("button", { name: "Refresh Prices", exact: true }).click();
  await expect.poll(() => queries.length).toBeGreaterThan(before);
  await expect(overview.getByRole("alert")).toHaveCount(0);
  await expect(overview.getByLabel("Movement Market")).toHaveValue("steam");
  expect(refreshes).toBe(1);
  expect(errors).toEqual([]);
});

for (const obsoleteFailure of [false, true]) {
  test(`overview ignores obsolete ${obsoleteFailure ? "failure" : "success"} after changing windows`, async ({
    page
  }) => {
    let release!: () => void;
    const initial = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reads = 0;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/portfolio") {
        await route.fulfill({ json: emptyPortfolio });
        return;
      }
      if (url.pathname === "/api/dashboard/movement") {
        const revision = ++reads;
        if (revision === 1) {
          await initial;
          if (obsoleteFailure) {
            await route.fulfill({ status: 503, json: { message: "Obsolete movement failure" } });
            return;
          }
        }
        await route.fulfill({
          json: movementFixture(url.searchParams.get("window") as MovementWindow)
        });
        return;
      }
      await route.fulfill({ json: watchlist });
    });
    try {
      await page.goto("/");
      await expect.poll(() => reads).toBe(1);
      const overview = page.getByRole("region", { name: "Market Overview", exact: true });
      await overview.getByRole("radio", { name: "7d", exact: true }).check();
      await expect(overview.getByRole("region", { name: "Biggest Risers" })).toContainText(
        "+300.00%"
      );
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
      await expect(overview.getByRole("region", { name: "Biggest Risers" })).toContainText(
        "+300.00%"
      );
      await expect(overview.getByRole("alert")).toHaveCount(0);
      await expect(overview).toHaveAttribute("aria-busy", "false");
      await expect(overview.getByRole("radio", { name: "7d", exact: true })).toBeChecked();
    } finally {
      release();
    }
  });
}
