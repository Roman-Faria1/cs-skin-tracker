import {
  alertEventPageSchema,
  alertEvaluationResponseSchema,
  alertRuleSchema,
  holdingSchema,
  portfolioSchema,
  movementReportSchema,
  importWatchlistResponseSchema,
  itemHistorySchema,
  refreshWatchlistResponseSchema,
  watchlistSchema,
  watchlistTransferSchema
} from "@csst/shared";
import type {
  AlertAction,
  AlertRuleInput,
  AddWatchlistItemRequest,
  ItemHistory,
  RefreshWatchlistResponse,
  Watchlist
} from "@csst/shared";
import type { HoldingInput } from "@csst/shared";
import type { MovementWindow } from "@csst/shared";
import type { WatchlistTransfer } from "@csst/shared";
import { z } from "zod";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export async function fetchMovement(window: MovementWindow, providerId: string | null = null) {
  const query = new URLSearchParams({ window });
  if (providerId !== null) query.set("providerId", providerId);
  const response = await fetch(`${apiBaseUrl}/dashboard/movement?${query}`, { cache: "no-store" });
  if (!response.ok)
    throw new Error(
      await getApiErrorMessage(response, `Unable to load movement: ${response.status}`)
    );
  return movementReportSchema.parse(await response.json());
}

async function portfolioRequest(
  path: string,
  method = "GET",
  body?: HoldingInput
): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}/portfolio${path}`, {
    method,
    cache: "no-store",
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  });
  if (!response.ok)
    throw new Error(
      await getApiErrorMessage(response, `Portfolio request failed: ${response.status}`)
    );
  return response.json();
}
export async function fetchPortfolio(providerId: string | null = null) {
  return portfolioSchema.parse(
    await portfolioRequest(
      providerId === null ? "" : `?providerId=${encodeURIComponent(providerId)}`
    )
  );
}
export async function saveHolding(input: HoldingInput, id?: string) {
  return holdingSchema.parse(
    await portfolioRequest(id ? `/${id}` : "", id ? "PUT" : "POST", input)
  );
}
export async function deleteHolding(id: string) {
  await portfolioRequest(`/${id}`, "DELETE");
}

async function alertRequest(path: string, method = "GET", body?: unknown): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}/alerts${path}`, {
    method,
    cache: "no-store",
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  });
  if (!response.ok)
    throw new Error(await getApiErrorMessage(response, `Alert request failed: ${response.status}`));
  return response.json();
}

export async function fetchAlerts() {
  return z.array(alertRuleSchema).parse(await alertRequest(""));
}
export async function fetchAlertEvents(cursor?: string) {
  return alertEventPageSchema.parse(
    await alertRequest(`/events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)
  );
}
export async function saveAlert(input: AlertRuleInput, id?: string) {
  return alertRuleSchema.parse(await alertRequest(id ? `/${id}` : "", id ? "PUT" : "POST", input));
}
export async function changeAlertStatus(id: string, action: AlertAction) {
  return alertRuleSchema.parse(await alertRequest(`/${id}`, "PATCH", { action }));
}
export async function deleteAlert(id: string) {
  await alertRequest(`/${id}`, "DELETE");
}
export async function evaluateAlerts() {
  return alertEvaluationResponseSchema.parse(await alertRequest("/evaluate", "POST"));
}

export async function fetchWatchlist(): Promise<Watchlist> {
  const response = await fetch(`${apiBaseUrl}/watchlists/default`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch watchlist: ${response.status}`);
  }

  return watchlistSchema.parse(await response.json());
}

export async function fetchItemHistory(itemId: string): Promise<ItemHistory> {
  const response = await fetch(`${apiBaseUrl}/watchlists/default/items/${itemId}/history`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch item history: ${response.status}`);
  }

  return itemHistorySchema.parse(await response.json());
}

export async function addWatchlistItem(request: AddWatchlistItemRequest): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/watchlists/default/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, `Failed to add item: ${response.status}`));
  }
}

export async function removeWatchlistItem(id: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/watchlists/default/items/${id}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error(`Failed to remove item: ${response.status}`);
  }
}

export async function refreshWatchlist(): Promise<RefreshWatchlistResponse> {
  const response = await fetch(`${apiBaseUrl}/watchlists/default/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh watchlist: ${response.status}`);
  }

  return refreshWatchlistResponseSchema.parse(await response.json());
}

export async function exportWatchlist(): Promise<WatchlistTransfer> {
  const response = await fetch(`${apiBaseUrl}/watchlists/default/export`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to export watchlist: ${response.status}`);
  return watchlistTransferSchema.parse(await response.json());
}

export async function importWatchlist(data: WatchlistTransfer) {
  const response = await fetch(`${apiBaseUrl}/watchlists/default/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!response.ok)
    throw new Error(
      await getApiErrorMessage(response, `Unable to import watchlist: ${response.status}`)
    );
  return importWatchlistResponseSchema.parse(await response.json());
}

async function getApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const parsed = z.object({ message: z.string() }).safeParse(await response.json());
    return parsed.success ? parsed.data.message : fallback;
  } catch {
    return fallback;
  }
}
