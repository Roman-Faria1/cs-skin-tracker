"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { Eye, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { holdingInputSchema, HOLDING_QUANTITY_LIMIT, PORTFOLIO_HOLDING_LIMIT } from "@csst/shared";
import type { Portfolio, ValuedHolding, Watchlist } from "@csst/shared";
import {
  addWatchlistItem,
  deleteHolding,
  fetchPortfolio,
  fetchWatchlist,
  saveHolding
} from "../lib/api";
import { formatPortfolioMoney as money } from "../lib/portfolio";

const date = (value: string) => new Date(value).toLocaleString();
const messageFor = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to complete portfolio request";
const quality: Record<ValuedHolding["valuationStatus"], string> = {
  fresh: "Fresh",
  stale: "Stale",
  unknown: "Source time unknown",
  missing: "No priced quote",
  invalid_time: "Invalid quote time"
};

export function PortfolioDashboard() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [watchlist, setWatchlist] = useState<Watchlist | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | undefined>();
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const loadVersion = useRef(0);
  const load = useCallback(
    async (
      provider: string | null,
      success = "",
      failurePrefix = "Unable to reload cached valuation: "
    ) => {
      const version = ++loadVersion.current;
      setBusy(true);
      setMessage("");
      try {
        const [next, watched] = await Promise.all([fetchPortfolio(provider), fetchWatchlist()]);
        if (version !== loadVersion.current) return;
        setPortfolio(next);
        setWatchlist(watched);
        setMessage(success);
      } catch (error) {
        if (version === loadVersion.current) setMessage(`${failurePrefix}${messageFor(error)}`);
      } finally {
        if (version === loadVersion.current) setBusy(false);
      }
    },
    []
  );
  useEffect(() => {
    void load(null, "", "");
    return () => {
      loadVersion.current += 1;
    };
  }, [load]);

  function reset() {
    setEditing(undefined);
    setQuantity("1");
    setCost("");
    setNotes("");
  }
  async function reload(provider = portfolio?.providerId ?? null) {
    await load(provider);
  }
  async function mutate(action: () => Promise<unknown>, success: string, clearForm = false) {
    // A write supersedes any pending read, including the initial mount request.
    const version = ++loadVersion.current;
    setBusy(true);
    setMessage("");
    try {
      await action();
      if (version !== loadVersion.current) return;
      if (clearForm) reset();
      await load(
        portfolio?.providerId ?? null,
        success,
        `${success} Cached view could not reload: `
      );
    } catch (error) {
      if (version === loadVersion.current) setMessage(messageFor(error));
    } finally {
      if (version === loadVersion.current) setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = holdingInputSchema.safeParse({
      itemId,
      quantity: Number(quantity),
      acquisitionPrice: cost.trim() === "" ? null : Number(cost),
      notes: notes || null
    });
    if (!input.success) {
      setMessage(input.error.issues.map((issue) => issue.message).join("; "));
      return;
    }
    await mutate(
      () => saveHolding(input.data, editing),
      editing ? "Holding updated." : "Holding added.",
      true
    );
  }
  function edit(holding: ValuedHolding) {
    setEditing(holding.id);
    setItemId(holding.itemId);
    setQuantity(holding.quantity.toString());
    setCost(holding.acquisitionPrice?.toString() ?? "");
    setNotes(holding.notes ?? "");
    form.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    form.current
      ?.querySelector<HTMLInputElement>('input[type="number"]')
      ?.focus({ preventScroll: true });
  }
  const summary = portfolio?.summary;
  const unwatchedEdit = portfolio?.holdings.find(
    (holding) => holding.id === editing && !holding.isWatched
  );
  return (
    <main className="page">
      <div className="shell portfolio-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Market Monitor</p>
            <h1>Portfolio</h1>
          </div>
          <div className="toolbar">
            <label className="portfolio-provider" htmlFor="valuation-provider">
              Valuation Market
              <select
                id="valuation-provider"
                className="input"
                value={portfolio?.providerId ?? ""}
                disabled={busy || !portfolio}
                onChange={(event) => void reload(event.target.value || null)}
              >
                <option value="">All markets (lowest ask)</option>
                {portfolio?.providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button secondary"
              disabled={busy && portfolio !== null}
              onClick={() => void reload()}
            >
              <RotateCcw size={18} aria-hidden="true" />
              Reload Cache
            </button>
          </div>
        </header>
        <p className="status" role="status" aria-live="polite">
          {message || (portfolio ? `Valued as of ${date(portfolio.asOf)}` : "Loading portfolio...")}
        </p>
        <p className="valuation-disclaimer">
          USD listing estimates, before fees. Not sale proceeds; Steam prices are
          wallet-denominated.
        </p>
        {summary && (
          <dl className="portfolio-summary">
            <div>
              <dt>Gross Ask Value (USD)</dt>
              <dd>{money(summary.grossAskValue)}</dd>
              <span
                className={`status-badge ${summary.valuationStatus === "complete" ? "fresh" : "stale"}`}
              >
                {summary.valuationStatus}
              </span>
            </div>
            <div>
              <dt>Known Cost Basis (USD)</dt>
              <dd>{money(summary.knownCostBasis)}</dd>
              <span>{summary.unknownCostHoldings} lots with unknown cost</span>
            </div>
            <div>
              <dt>Unrealized P&amp;L (USD)</dt>
              <dd className={summary.unrealizedPnl?.startsWith("-") ? "pnl-negative" : ""}>
                {money(summary.unrealizedPnl)}
              </dd>
              <span>{summary.pnlHoldings} priced, known-cost lots</span>
            </div>
            <div>
              <dt>Price Coverage</dt>
              <dd>
                {summary.valuedHoldings} / {summary.holdingCount} lots
              </dd>
              <span>
                {summary.totalQuantity} skins | {summary.unvaluedHoldings} unvalued lots
              </span>
            </div>
          </dl>
        )}
        <section className="alerts-section" aria-labelledby="holding-form-heading">
          <h2 id="holding-form-heading">{editing ? "Edit Holding" : "New Holding"}</h2>
          {watchlist?.items.length === 0 && !editing && (
            <p className="muted">
              No watched items. <Link href="/">Watchlist</Link>
            </p>
          )}
          <form ref={form} onSubmit={(event) => void submit(event)}>
            <fieldset className="holding-form" disabled={busy || !portfolio}>
              <div className="form-field holding-item">
                <label htmlFor="holding-item">Item</label>
                <select
                  id="holding-item"
                  className="input"
                  required
                  value={itemId}
                  onChange={(event) => setItemId(event.target.value)}
                >
                  <option value="">Select item</option>
                  {unwatchedEdit && (
                    <option value={unwatchedEdit.itemId}>
                      {unwatchedEdit.marketHashName} (unwatched)
                    </option>
                  )}
                  {watchlist?.items.map((entry) => (
                    <option key={entry.item.id} value={entry.item.id}>
                      {entry.item.marketHashName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="holding-quantity">Quantity</label>
                <input
                  id="holding-quantity"
                  className="input"
                  type="number"
                  required
                  min="1"
                  max={HOLDING_QUANTITY_LIMIT}
                  step="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor="holding-cost">Acquisition / Skin (USD)</label>
                <input
                  id="holding-cost"
                  className="input"
                  type="number"
                  placeholder="Unknown"
                  min="0"
                  max="9999999999.99"
                  step="0.01"
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                />
              </div>
              <div className="form-field holding-notes">
                <label htmlFor="holding-notes">Notes</label>
                <textarea
                  id="holding-notes"
                  className="input"
                  rows={2}
                  maxLength={2000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
              <div className="toolbar holding-commands">
                <button
                  className="button"
                  type="submit"
                  disabled={!editing && (summary?.holdingCount ?? 0) >= PORTFOLIO_HOLDING_LIMIT}
                >
                  <Plus size={18} aria-hidden="true" />
                  {editing ? "Save Holding" : "Add Holding"}
                </button>
                {editing && (
                  <button
                    type="button"
                    className="button secondary icon-button"
                    title="Cancel edit"
                    aria-label="Cancel edit"
                    onClick={reset}
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        </section>
        <section className="alerts-section" aria-labelledby="holdings-heading">
          <h2 id="holdings-heading">Holdings{summary ? ` (${summary.holdingCount})` : ""}</h2>
          <div className="table-wrap">
            <table className="holdings-table">
              <thead>
                <tr>
                  <th>Item / Lot</th>
                  <th>Quantity</th>
                  <th>Unit Ask (USD)</th>
                  <th>Quality</th>
                  <th>Cost Basis (USD)</th>
                  <th>Gross Value (USD)</th>
                  <th>Unrealized P&amp;L (USD)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {portfolio?.holdings.map((holding) => (
                  <tr key={holding.id}>
                    <td>
                      {holding.isWatched ? (
                        <Link className="item-name" href={`/items/${holding.itemId}`}>
                          {holding.marketHashName}
                        </Link>
                      ) : (
                        <strong>{holding.marketHashName}</strong>
                      )}
                      {!holding.isWatched && (
                        <div className="unwatched-label">
                          Unwatched: scheduled collection stopped
                        </div>
                      )}
                      {holding.notes && <p className="holding-note">{holding.notes}</p>}
                    </td>
                    <td>{holding.quantity.toLocaleString()}</td>
                    <td>
                      {money(holding.unitPrice)}
                      {holding.quote && (
                        <details className="quote-evidence">
                          <summary>{holding.quote.provider}</summary>
                          <p>
                            Source:{" "}
                            {holding.quote.sourceUpdatedAt
                              ? date(holding.quote.sourceUpdatedAt)
                              : "Unknown"}
                          </p>
                          <p>Collected: {date(holding.quote.collectedAt)}</p>
                          <small>Snapshot {holding.quote.id}</small>
                        </details>
                      )}
                    </td>
                    <td>
                      <span
                        className={`status-badge ${holding.valuationStatus === "fresh" ? "fresh" : holding.valuationStatus === "stale" ? "stale" : "neutral"}`}
                      >
                        {quality[holding.valuationStatus]}
                      </span>
                    </td>
                    <td>{holding.costBasis === null ? "Unknown" : money(holding.costBasis)}</td>
                    <td>{money(holding.marketValue)}</td>
                    <td className={holding.unrealizedPnl?.startsWith("-") ? "pnl-negative" : ""}>
                      {money(holding.unrealizedPnl)}
                    </td>
                    <td>
                      <div className="toolbar holding-actions">
                        {!holding.isWatched && (
                          <button
                            className="button secondary icon-button"
                            title="Watch item"
                            aria-label={`Watch ${holding.marketHashName}`}
                            disabled={busy}
                            onClick={() =>
                              void mutate(
                                () => addWatchlistItem({ marketHashName: holding.marketHashName }),
                                "Item watched."
                              )
                            }
                          >
                            <Eye size={18} />
                          </button>
                        )}
                        <button
                          className="button secondary icon-button"
                          title="Edit holding"
                          aria-label={`Edit holding ${holding.marketHashName}`}
                          disabled={busy}
                          onClick={() => edit(holding)}
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          className="button danger icon-button"
                          title="Delete holding"
                          aria-label={`Delete holding ${holding.marketHashName}`}
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(`Delete this holding for ${holding.marketHashName}?`)
                            )
                              void mutate(
                                () => deleteHolding(holding.id),
                                "Holding deleted.",
                                editing === holding.id
                              );
                          }}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {portfolio && portfolio.holdings.length === 0 && (
                  <tr>
                    <td colSpan={8} className="empty">
                      No holdings
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
