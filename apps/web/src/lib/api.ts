import { itemHistorySchema, watchlistSchema } from "@csst/shared";
import type {
  AddWatchlistItemRequest,
  ItemHistory,
  RefreshWatchlistResponse,
  Watchlist
} from "@csst/shared";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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
    throw new Error(`Failed to add item: ${response.status}`);
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

  return (await response.json()) as RefreshWatchlistResponse;
}
