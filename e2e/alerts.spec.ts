import { expect, test } from "@playwright/test";
import type { AlertRule, AlertEvent } from "@csst/shared";

const itemId = "00000000-0000-4000-8000-000000000201";
const id = "00000000-0000-4000-8000-000000000301";
const marketHashName = "AK-47 | Redline (Field-Tested)";
const at = "2026-10-17T12:00:00.000Z";
const snapshot = {
  id: "00000000-0000-4000-8000-000000000401",
  itemId,
  provider: "steam",
  lowestAsk: 10,
  highestBid: null,
  askVolume: 1,
  bidVolume: null,
  currency: "USD" as const,
  collectedAt: at,
  sourceUpdatedAt: at,
  freshness: "fresh" as const,
  isStale: false
};

test("alert lifecycle and retained evidence", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let rules: AlertRule[] = [];
  let events: AlertEvent[] = [];
  let evaluations = 0;
  let providerRequests = 0;
  await page.route("**/watchlists/default**", async (route) => {
    if (route.request().method() !== "GET") providerRequests += 1;
    await route.fulfill({
      json: {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Default",
        items: [
          {
            id: "00000000-0000-4000-8000-000000000101",
            item: { id: itemId, marketHashName, imageUrl: null, createdAt: at },
            latestSnapshots: [snapshot]
          }
        ]
      }
    });
  });
  await page.route("**/api/alerts**", async (route) => {
    const method = route.request().method();
    const path = new URL(route.request().url()).pathname.slice(4);
    if (method === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "access-control-allow-headers": "Content-Type"
        }
      });
      return;
    }
    if (path.endsWith("/events")) {
      await route.fulfill({ json: { events, nextCursor: null } });
      return;
    }
    if (path.endsWith("/evaluate")) {
      evaluations += 1;
      const rule = rules[0]!;
      rules = [
        {
          ...rule,
          status: "triggered",
          lastEvaluatedAt: at,
          lastEvaluation: "steam lowest ask is $10.00",
          triggeredAt: at
        }
      ];
      events = [
        {
          id: "00000000-0000-4000-8000-000000000501",
          alertId: rule.id,
          itemId,
          marketHashName,
          kind: rule.kind,
          generation: rule.generation,
          threshold: rule.threshold!,
          providerId: null,
          observedValue: 10,
          message: "steam lowest ask is $10.00",
          triggeredAt: at,
          evidence: { snapshots: [snapshot], baseline: null, armedAt: at }
        }
      ];
      await route.fulfill({ json: { evaluated: 1, triggered: 1 } });
      return;
    }
    if (method === "POST" || method === "PUT") {
      const input = route.request().postDataJSON() as {
        itemId: string;
        kind: AlertRule["kind"];
        threshold: number;
        providerId: string | null;
      };
      const rule: AlertRule = {
        ...input,
        id,
        marketHashName,
        status: "active",
        generation: method === "PUT" ? rules[0]!.generation + 1 : 1,
        createdAt: at,
        armedAt: at,
        triggeredAt: null,
        baselineSnapshot: null,
        lastEvaluatedAt: null,
        lastEvaluation: null
      };
      rules = [rule];
      await route.fulfill({ json: rule });
      return;
    }
    if (method === "PATCH") {
      const action = (route.request().postDataJSON() as { action: string }).action;
      const rule = rules[0]!;
      rules = [
        {
          ...rule,
          status: action === "pause" ? "paused" : "active",
          generation: rule.generation + (action === "rearm" ? 1 : 0)
        }
      ];
      await route.fulfill({ json: rules[0] });
      return;
    }
    if (method === "DELETE") {
      rules = [];
      events = events.map((event) => ({ ...event, alertId: null }));
      await route.fulfill({ json: { removed: true } });
      return;
    }
    await route.fulfill({ json: rules });
  });

  await page.goto("/alerts");
  await expect(page.getByText("No alert rules", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Item", exact: true }).selectOption(itemId);
  await page.getByLabel("Amount (USD)").fill("11");
  await page.getByRole("button", { name: "Create Rule" }).click();
  await expect(page.getByRole("status")).toHaveText("Alert rule created.");
  await page.getByRole("checkbox", { name: `Active rule for ${marketHashName}` }).click();
  await expect(page.getByText("paused", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  await page.getByRole("checkbox").click();
  await expect(page.getByRole("status")).toHaveText("Rule resumed.");
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "Check Conditions" }).click();
  await expect(page.getByText("triggered", { exact: true })).toBeVisible();
  await page.getByText("Evidence", { exact: true }).click();
  await expect(page.getByText(`Snapshot ${snapshot.id}`, { exact: true })).toBeVisible();
  expect(evaluations).toBe(1);
  expect(providerRequests).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("alerts.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.getByRole("button", { name: `Rearm ${marketHashName}` }).click();
  await expect(page.getByRole("status")).toHaveText("Rule rearmed.");
  await page.getByRole("button", { name: `Edit ${marketHashName}` }).click();
  await page.getByLabel("Amount (USD)").fill("9");
  await page.getByRole("button", { name: "Save Rule" }).click();
  await expect(page.getByRole("status")).toHaveText("Rule updated and rearmed.");
  await expect(page.getByRole("cell", { name: "$9.00 All providers" })).toBeVisible();
  await expect(page.getByText("Price below: $11.00", { exact: false })).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: `Delete ${marketHashName}` }).click();
  await expect(page.getByText("No alert rules", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alert History" })).toBeVisible();
  await expect(page.getByText("steam lowest ask is $10.00", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
