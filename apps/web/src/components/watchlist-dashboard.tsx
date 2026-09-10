"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { PriceSnapshot, RefreshWatchlistResponse, Watchlist } from "@csst/shared";

import {
  addWatchlistItem,
  fetchWatchlist,
  refreshWatchlist,
  removeWatchlistItem
} from "../lib/api";

export function WatchlistDashboard() {
  const [watchlist, setWatchlist] = useState<Watchlist | null>(null);
  const [marketHashName, setMarketHashName] = useState("");
  const [status, setStatus] = useState("Loading watchlist...");
  const [isBusy, setIsBusy] = useState(false);

  const itemCount = watchlist?.items.length ?? 0;
  const snapshotCount = useMemo(
    () => watchlist?.items.reduce((count, item) => count + item.latestSnapshots.length, 0) ?? 0,
    [watchlist]
  );

  async function loadWatchlist(nextStatus = "") {
    const nextWatchlist = await fetchWatchlist();
    setWatchlist(nextWatchlist);
    setStatus(nextStatus);
  }

  useEffect(() => {
    void loadWatchlist("").catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "Unable to load watchlist.");
    });
  }, []);

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setStatus("Adding item...");

    try {
      await addWatchlistItem({ marketHashName });
      setMarketHashName("");
      await loadWatchlist("Item added.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to add item.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRefresh() {
    setIsBusy(true);
    setStatus("Refreshing prices...");

    try {
      const result = await refreshWatchlist();
      await loadWatchlist(getRefreshStatusMessage(result));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to refresh prices.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRemove(id: string) {
    setIsBusy(true);
    setStatus("Removing item...");

    try {
      await removeWatchlistItem(id);
      await loadWatchlist("Item removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to remove item.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Personal MVP</p>
            <h1>CS Skin Tracker</h1>
            <p className="subtitle">
              Watchlist pricing, provider snapshots, and request-budget-aware refreshes.
            </p>
          </div>
          <div className="toolbar">
            <span className="muted">{itemCount} watched</span>
            <span className="muted">{snapshotCount} snapshots</span>
          </div>
        </header>

        <form className="form" onSubmit={(event) => void handleAdd(event)}>
          <input
            className="input"
            disabled={isBusy}
            onChange={(event) => setMarketHashName(event.target.value)}
            placeholder="AK-47 | Redline (Field-Tested)"
            value={marketHashName}
          />
          <button className="button" disabled={isBusy || marketHashName.trim().length < 3}>
            Add Skin
          </button>
          <button
            className="button secondary"
            disabled={isBusy || itemCount === 0}
            type="button"
            onClick={() => void handleRefresh()}
          >
            Refresh Prices
          </button>
        </form>

        <p className="status">{status}</p>

        <section className="table-wrap watchlist-table" aria-label="Watchlist">
          <table>
            <thead>
              <tr>
                <th>Skin</th>
                <th>Latest Providers</th>
                <th>Best Market</th>
                <th>Freshness</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {watchlist?.items.map((entry) => {
                const latestSnapshots = getLatestSnapshotsByProvider(entry.latestSnapshots);
                const newest = latestSnapshots[0];
                const comparison = getProviderComparison(latestSnapshots);

                return (
                  <tr key={entry.id}>
                    <td>
                      <div className="item-name">{entry.item.marketHashName}</div>
                      <div className="muted">{entry.item.id}</div>
                    </td>
                    <td>
                      {latestSnapshots.length === 0 ? (
                        <span className="muted">No snapshots yet</span>
                      ) : (
                        <div className="snapshot-list">
                          {latestSnapshots.slice(0, 5).map((snapshot) => (
                            <span
                              className={`snapshot-pill ${snapshot.isStale ? "stale" : "fresh"}`}
                              key={snapshot.id}
                            >
                              {snapshot.provider}:{" "}
                              {snapshot.lowestAsk === null
                                ? "n/a"
                                : formatCurrency(snapshot.lowestAsk)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      {comparison === null ? (
                        <span className="muted">No priced providers</span>
                      ) : (
                        <div className="comparison-cell">
                          <strong>{comparison.cheapest.provider}</strong>
                          <span className="muted">
                            Low {formatCurrency(comparison.cheapest.lowestAsk)} · Spread{" "}
                            {formatCurrency(comparison.spread)}
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${getStatusClassName(newest)}`}>
                        {newest === undefined
                          ? "Not refreshed"
                          : newest.isStale
                            ? "Stale"
                            : "Fresh"}
                      </span>
                      <div className="muted">{newest?.collectedAt ?? ""}</div>
                    </td>
                    <td>
                      <a className="button secondary compact" href={`/items/${entry.item.id}`}>
                        View
                      </a>
                      <button
                        className="button danger"
                        disabled={isBusy}
                        onClick={() => void handleRemove(entry.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
              {watchlist !== null && watchlist.items.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={5}>
                    Add a market hash name to begin tracking.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

function getLatestSnapshotsByProvider(snapshots: PriceSnapshot[]): PriceSnapshot[] {
  const latest = new Map<string, PriceSnapshot>();
  for (const snapshot of snapshots) {
    const current = latest.get(snapshot.provider);
    if (current === undefined || compareCollectedAtDesc(snapshot, current) < 0) {
      latest.set(snapshot.provider, snapshot);
    }
  }

  return Array.from(latest.values()).sort(compareCollectedAtDesc);
}

interface ProviderComparison {
  cheapest: PriceSnapshot & { lowestAsk: number };
  mostExpensive: PriceSnapshot & { lowestAsk: number };
  spread: number;
}

function getProviderComparison(snapshots: PriceSnapshot[]): ProviderComparison | null {
  const pricedSnapshots = snapshots.filter(
    (snapshot): snapshot is PriceSnapshot & { lowestAsk: number } => snapshot.lowestAsk !== null
  );

  if (pricedSnapshots.length === 0) {
    return null;
  }

  const sorted = pricedSnapshots.sort((left, right) => left.lowestAsk - right.lowestAsk);
  const cheapest = sorted[0];
  const mostExpensive = sorted.at(-1);
  if (cheapest === undefined || mostExpensive === undefined) {
    return null;
  }

  return {
    cheapest,
    mostExpensive,
    spread: mostExpensive.lowestAsk - cheapest.lowestAsk
  };
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function getStatusClassName(snapshot: PriceSnapshot | undefined): string {
  if (snapshot === undefined) {
    return "neutral";
  }

  return snapshot.isStale ? "stale" : "fresh";
}

function compareCollectedAtDesc(left: PriceSnapshot, right: PriceSnapshot): number {
  return Date.parse(right.collectedAt) - Date.parse(left.collectedAt);
}

function getRefreshStatusMessage(result: RefreshWatchlistResponse): string {
  const budget = result.remainingMonthlyBudget ?? "unknown";

  if (result.failedItems > 0) {
    const failedNames = result.itemResults
      .filter((item) => item.status === "failed")
      .slice(0, 3)
      .map((item) => item.marketHashName)
      .join(", ");

    return `Refresh completed with ${result.failedItems} failed item${
      result.failedItems === 1 ? "" : "s"
    }. ${result.snapshotsCreated} snapshots created. Failed: ${failedNames}. Remaining monthly budget: ${budget}.`;
  }

  return `Refresh complete. ${result.snapshotsCreated} snapshots created. Remaining monthly budget: ${budget}.`;
}
