"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RotateCcw, TrendingDown, TrendingUp } from "lucide-react";
import type {
  ComparableMovement,
  MovementReport,
  MovementWindow,
  Portfolio,
  Provider
} from "@csst/shared";
import { fetchMovement, fetchPortfolio } from "../lib/api";
import { formatMovementPercent, movementQualityLabels } from "../lib/movement";
import { formatPortfolioMoney as money } from "../lib/portfolio";

const date = (value: string) => new Date(value).toLocaleString();
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Cached data unavailable";

export function MarketOverview({ revision }: { revision: number }) {
  const [window, setWindow] = useState<MovementWindow>("24h");
  const [providerId, setProviderId] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [report, setReport] = useState<MovementReport | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [movementError, setMovementError] = useState("");
  const [portfolioError, setPortfolioError] = useState("");
  const requestVersion = useRef(0);
  useEffect(() => {
    const version = ++requestVersion.current;
    setLoading(true);
    setReport(null);
    setPortfolio(null);
    setMovementError("");
    setPortfolioError("");
    void Promise.allSettled([fetchMovement(window, providerId), fetchPortfolio()]).then(
      ([movement, value]) => {
        if (version !== requestVersion.current) return;
        if (movement.status === "fulfilled") {
          setReport(movement.value);
          setProviders(movement.value.providers);
        } else setMovementError(errorMessage(movement.reason));
        if (value.status === "fulfilled") setPortfolio(value.value);
        else setPortfolioError(errorMessage(value.reason));
        setLoading(false);
      }
    );
    return () => {
      requestVersion.current += 1;
    };
  }, [window, providerId, revision, attempt]);
  const summary = report?.summary;
  return (
    <section className="market-overview" aria-labelledby="overview-heading" aria-busy={loading}>
      <header className="overview-header">
        <h2 id="overview-heading">Market Overview</h2>
        <div className="toolbar">
          <fieldset className="window-control">
            <legend className="sr-only">Movement window</legend>
            {(["24h", "7d"] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="movement-window"
                  value={value}
                  checked={window === value}
                  onChange={() => setWindow(value)}
                />
                <span>{value}</span>
              </label>
            ))}
          </fieldset>
          <label className="sr-only" htmlFor="movement-market">
            Movement Market
          </label>
          <select
            id="movement-market"
            className="input overview-provider"
            value={providerId ?? ""}
            onChange={(event) => setProviderId(event.target.value || null)}
          >
            <option value="">All markets (lowest ask)</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
          <button
            className="button secondary icon-button"
            title="Reload cached summary"
            aria-label="Reload cached summary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </header>
      {movementError && (
        <p className="overview-error" role="alert">
          Movement: {movementError}
        </p>
      )}
      {portfolioError && (
        <p className="overview-error" role="alert">
          Portfolio: {portfolioError}
        </p>
      )}
      <dl className="overview-metrics">
        <div>
          <dt>Compared Skins</dt>
          <dd>{summary ? `${summary.comparableItems} / ${summary.watchedItems}` : "--"}</dd>
          <span>
            {summary
              ? `${summary.excludedItems} unavailable`
              : loading
                ? "Loading..."
                : "Unavailable"}
          </span>
        </div>
        <div>
          <dt>Rising</dt>
          <dd className="movement-up">{summary?.up ?? "--"}</dd>
        </div>
        <div>
          <dt>Falling</dt>
          <dd className="movement-down">{summary?.down ?? "--"}</dd>
        </div>
        <div>
          <dt>Flat</dt>
          <dd>{summary?.flat ?? "--"}</dd>
        </div>
        <div>
          <dt>Portfolio Gross Ask (USD)</dt>
          <dd>{portfolio ? money(portfolio.summary.grossAskValue) : "--"}</dd>
          <span>
            {portfolio
              ? `All markets | ${portfolio.summary.valuationStatus}`
              : loading
                ? "Loading..."
                : "Unavailable"}
          </span>
          <Link href="/portfolio">Portfolio</Link>
        </div>
      </dl>
      <p className="overview-meta" aria-live="polite">
        {report
          ? `As of ${date(report.asOf)} | Baseline at/before ${date(report.comparisonAt)}, up to ${report.maxBaselineAgeHours}h earlier | Same-market asks`
          : loading
            ? "Loading saved price comparisons..."
            : "Movement unavailable"}
      </p>
      {portfolio && (
        <p className="overview-meta">
          Portfolio as of {date(portfolio.asOf)} | USD listing estimates before fees, not sale
          proceeds. Steam wallet asks included.
        </p>
      )}
      <div className="movers-grid">
        <Movers
          title="Biggest Risers"
          rows={report?.gainers ?? []}
          pending={loading}
          available={report !== null}
          up
        />
        <Movers
          title="Biggest Fallers"
          rows={report?.decliners ?? []}
          pending={loading}
          available={report !== null}
          up={false}
        />
      </div>
      {report && (
        <details className="movement-coverage">
          <summary>Comparison Details ({report.items.length} skins)</summary>
          <div className="table-wrap">
            <table className="coverage-table">
              <thead>
                <tr>
                  <th>Skin</th>
                  <th>Market</th>
                  <th>Quality</th>
                  <th>Change</th>
                  <th>Current Ask (USD)</th>
                  <th>Baseline Ask (USD)</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((item) => (
                  <tr key={item.itemId}>
                    <td>
                      <Link href={`/items/${item.itemId}`}>{item.marketHashName}</Link>
                    </td>
                    <td>{item.providerId ?? "--"}</td>
                    <td>{movementQualityLabels[item.status]}</td>
                    <td>
                      {item.status === "comparable"
                        ? formatMovementPercent(item.changePercent)
                        : "Unavailable"}
                    </td>
                    {[item.current, item.baseline].map((quote, index) => (
                      <td key={index}>
                        {quote?.lowestAsk === null || quote === null
                          ? "Unavailable"
                          : money(quote.lowestAsk.toFixed(2))}
                        {quote && (
                          <>
                            <div className="muted">
                              Source:{" "}
                              {quote.sourceUpdatedAt ? date(quote.sourceUpdatedAt) : "Unknown"}
                            </div>
                            <div className="muted">Collected: {date(quote.collectedAt)}</div>
                          </>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {report.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">
                      No watched skins
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

function Movers({
  title,
  rows,
  pending,
  available,
  up
}: {
  title: string;
  rows: ComparableMovement[];
  pending: boolean;
  available: boolean;
  up: boolean;
}) {
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <section className="movers-section" aria-label={title}>
      <h3>
        <Icon size={18} aria-hidden="true" />
        {title}
      </h3>
      <div className="table-wrap">
        <table className="movers-table">
          <thead>
            <tr>
              <th>Skin / Market</th>
              <th>Change</th>
              <th>Current / Baseline (USD)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.itemId}>
                <td>
                  <Link href={`/items/${row.itemId}`}>{row.marketHashName}</Link>
                  <div className="muted">{row.providerId}</div>
                </td>
                <td className={up ? "movement-up" : "movement-down"}>
                  <strong>{formatMovementPercent(row.changePercent)}</strong>
                  <div>{money(row.changeUsd)}</div>
                </td>
                <td>
                  {money(row.current.lowestAsk!.toFixed(2))} /{" "}
                  {money(row.baseline.lowestAsk!.toFixed(2))}
                  <div className="muted">Baseline: {date(row.baseline.collectedAt)}</div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="empty">
                  {pending
                    ? "Loading..."
                    : !available
                      ? "Unavailable"
                      : up
                        ? "No comparable risers"
                        : "No comparable fallers"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
