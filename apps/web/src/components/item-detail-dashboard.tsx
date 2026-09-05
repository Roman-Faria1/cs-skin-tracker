"use client";

import { useEffect, useMemo, useState } from "react";
import type { ItemHistory, PriceSnapshot } from "@csst/shared";

import { fetchItemHistory } from "../lib/api";

const chartWidth = 760;
const chartHeight = 280;
const chartPadding = 34;

const providerColors = [
  "#0f766e",
  "#2563eb",
  "#b42318",
  "#7c3aed",
  "#c2410c",
  "#475569",
  "#15803d"
];

export function ItemDetailDashboard({ itemId }: { itemId: string }) {
  const [history, setHistory] = useState<ItemHistory | null>(null);
  const [status, setStatus] = useState("Loading item history...");

  useEffect(() => {
    void fetchItemHistory(itemId)
      .then((nextHistory) => {
        setHistory(nextHistory);
        setStatus("");
      })
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : "Unable to load item history.");
      });
  }, [itemId]);

  const pricedSnapshots = useMemo(
    () => history?.snapshots.filter((snapshot) => snapshot.lowestAsk !== null) ?? [],
    [history]
  );
  const providers = useMemo(() => groupByProvider(pricedSnapshots), [pricedSnapshots]);
  const latestByProvider = useMemo(() => getLatestByProvider(history?.snapshots ?? []), [history]);
  const latestLowestAsk = useMemo(() => getLatestLowestAsk(history?.snapshots ?? []), [history]);

  return (
    <main className="page">
      <div className="shell">
        <header className="detail-topbar">
          <div>
            <a className="back-link" href="/">
              Back to watchlist
            </a>
            <p className="eyebrow">Item Detail</p>
            <h1>{history?.item.marketHashName ?? "Loading skin..."}</h1>
            <p className="subtitle">
              Persisted lowest-ask history by provider, collected from backend snapshots.
            </p>
          </div>
          <div className="metric-strip">
            <div>
              <span className="metric-label">Latest lowest ask</span>
              <strong>{latestLowestAsk === null ? "n/a" : formatCurrency(latestLowestAsk)}</strong>
            </div>
            <div>
              <span className="metric-label">Snapshots</span>
              <strong>{history?.snapshots.length ?? 0}</strong>
            </div>
            <div>
              <span className="metric-label">Providers</span>
              <strong>{latestByProvider.length}</strong>
            </div>
          </div>
        </header>

        <p className="status">{status}</p>

        <section className="detail-grid">
          <div className="chart-panel" aria-label="Price history chart">
            <div className="panel-heading">
              <h2>Lowest Ask History</h2>
              <span className="muted">{pricedSnapshots.length} priced snapshots</span>
            </div>
            <PriceHistoryChart providers={providers} />
          </div>

          <aside className="provider-panel" aria-label="Provider latest prices">
            <div className="panel-heading">
              <h2>Providers</h2>
              <span className="muted">Latest snapshot</span>
            </div>
            {latestByProvider.length === 0 ? (
              <p className="empty-panel">Refresh prices from the watchlist to collect snapshots.</p>
            ) : (
              <div className="provider-list">
                {latestByProvider.map((snapshot, index) => (
                  <div className="provider-row" key={snapshot.provider}>
                    <span
                      className="provider-dot"
                      style={{ background: providerColors[index % providerColors.length] }}
                    />
                    <div>
                      <strong>{snapshot.provider}</strong>
                      <span className="muted">
                        {snapshot.lowestAsk === null ? "n/a" : formatCurrency(snapshot.lowestAsk)}
                      </span>
                    </div>
                    <time className="provider-time">{formatDateTime(snapshot.collectedAt)}</time>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </section>

        <section className="table-wrap detail-table" aria-label="Snapshot history">
          <table>
            <thead>
              <tr>
                <th>Collected</th>
                <th>Provider</th>
                <th>Lowest Ask</th>
                <th>Highest Bid</th>
                <th>Volume</th>
              </tr>
            </thead>
            <tbody>
              {history?.snapshots
                .slice()
                .reverse()
                .map((snapshot) => (
                  <tr key={snapshot.id}>
                    <td className="muted">{formatDateTime(snapshot.collectedAt)}</td>
                    <td>{snapshot.provider}</td>
                    <td>
                      {snapshot.lowestAsk === null ? (
                        <span className="muted">n/a</span>
                      ) : (
                        formatCurrency(snapshot.lowestAsk)
                      )}
                    </td>
                    <td>
                      {snapshot.highestBid === null ? (
                        <span className="muted">n/a</span>
                      ) : (
                        formatCurrency(snapshot.highestBid)
                      )}
                    </td>
                    <td className="muted">{snapshot.askVolume ?? "n/a"}</td>
                  </tr>
                ))}
              {history !== null && history.snapshots.length === 0 ? (
                <tr>
                  <td className="empty" colSpan={5}>
                    No snapshots yet. Refresh prices from the watchlist.
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

function PriceHistoryChart({ providers }: { providers: Map<string, PriceSnapshot[]> }) {
  const allSnapshots = Array.from(providers.values()).flat();

  if (allSnapshots.length < 2) {
    return (
      <div className="chart-empty">
        <span>Collect at least two priced snapshots to draw a trend.</span>
      </div>
    );
  }

  const timestamps = allSnapshots.map((snapshot) => new Date(snapshot.collectedAt).getTime());
  const prices = allSnapshots
    .map((snapshot) => snapshot.lowestAsk)
    .filter((price): price is number => price !== null);
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const timeRange = Math.max(maxTime - minTime, 1);
  const priceRange = Math.max(maxPrice - minPrice, 1);

  const x = (timestamp: number) =>
    chartPadding + ((timestamp - minTime) / timeRange) * (chartWidth - chartPadding * 2);
  const y = (price: number) =>
    chartHeight -
    chartPadding -
    ((price - minPrice) / priceRange) * (chartHeight - chartPadding * 2);

  return (
    <div className="chart-scroll">
      <svg
        className="price-chart"
        role="img"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        aria-label="Lowest ask price trend by provider"
      >
        <line
          className="chart-axis"
          x1={chartPadding}
          x2={chartPadding}
          y1={chartPadding}
          y2={chartHeight - chartPadding}
        />
        <line
          className="chart-axis"
          x1={chartPadding}
          x2={chartWidth - chartPadding}
          y1={chartHeight - chartPadding}
          y2={chartHeight - chartPadding}
        />
        <text className="chart-label" x={chartPadding} y={chartPadding - 10}>
          {formatCurrency(maxPrice)}
        </text>
        <text className="chart-label" x={chartPadding} y={chartHeight - chartPadding + 22}>
          {formatCurrency(minPrice)}
        </text>
        {Array.from(providers.entries()).map(([provider, snapshots], index) => {
          const path = snapshots
            .map((snapshot, pointIndex) => {
              const price = snapshot.lowestAsk ?? 0;
              const command = pointIndex === 0 ? "M" : "L";
              return `${command}${x(new Date(snapshot.collectedAt).getTime())},${y(price)}`;
            })
            .join(" ");
          const color = providerColors[index % providerColors.length];

          return (
            <g key={provider}>
              <path d={path} fill="none" stroke={color} strokeLinecap="round" strokeWidth="2.5" />
              {snapshots.map((snapshot) => (
                <circle
                  cx={x(new Date(snapshot.collectedAt).getTime())}
                  cy={y(snapshot.lowestAsk ?? 0)}
                  fill={color}
                  key={snapshot.id}
                  r="3.5"
                />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        {Array.from(providers.keys()).map((provider, index) => (
          <span key={provider}>
            <span
              className="provider-dot"
              style={{ background: providerColors[index % providerColors.length] }}
            />
            {provider}
          </span>
        ))}
      </div>
    </div>
  );
}

function groupByProvider(snapshots: PriceSnapshot[]): Map<string, PriceSnapshot[]> {
  const groups = new Map<string, PriceSnapshot[]>();
  for (const snapshot of snapshots) {
    const existing = groups.get(snapshot.provider) ?? [];
    existing.push(snapshot);
    groups.set(snapshot.provider, existing);
  }

  return groups;
}

function getLatestByProvider(snapshots: PriceSnapshot[]): PriceSnapshot[] {
  const latest = new Map<string, PriceSnapshot>();
  for (const snapshot of snapshots) {
    latest.set(snapshot.provider, snapshot);
  }

  return Array.from(latest.values()).sort((left, right) =>
    left.provider.localeCompare(right.provider)
  );
}

function getLatestLowestAsk(snapshots: PriceSnapshot[]): number | null {
  const latest = snapshots
    .slice()
    .reverse()
    .map((snapshot) => snapshot.lowestAsk)
    .find((price) => price !== null);

  return latest ?? null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
