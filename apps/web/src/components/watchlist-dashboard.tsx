"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Watchlist } from "@csst/shared";

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
      await loadWatchlist(
        `Refresh complete. ${result.snapshotsCreated} snapshots created. Remaining monthly budget: ${
          result.remainingMonthlyBudget ?? "unknown"
        }.`
      );
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

        <section className="table-wrap" aria-label="Watchlist">
          <table>
            <thead>
              <tr>
                <th>Skin</th>
                <th>Latest Providers</th>
                <th>Last Collected</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {watchlist?.items.map((entry) => {
                const newest = entry.latestSnapshots[0];

                return (
                  <tr key={entry.id}>
                    <td>
                      <div className="item-name">{entry.item.marketHashName}</div>
                      <div className="muted">{entry.item.id}</div>
                    </td>
                    <td>
                      {entry.latestSnapshots.length === 0 ? (
                        <span className="muted">No snapshots yet</span>
                      ) : (
                        <div className="snapshot-list">
                          {entry.latestSnapshots.slice(0, 4).map((snapshot) => (
                            <span className="snapshot-pill" key={snapshot.id}>
                              {snapshot.provider}:{" "}
                              {snapshot.lowestAsk === null ? "n/a" : `$${snapshot.lowestAsk}`}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="muted">{newest?.collectedAt ?? "Not refreshed"}</td>
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
                  <td className="empty" colSpan={4}>
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
