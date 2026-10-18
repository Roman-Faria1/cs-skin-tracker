"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { CheckCheck, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { alertRuleInputSchema } from "@csst/shared";
import type { AlertEvent, AlertKind, AlertRule, Watchlist } from "@csst/shared";
import {
  changeAlertStatus,
  deleteAlert,
  evaluateAlerts,
  fetchAlertEvents,
  fetchAlerts,
  fetchWatchlist,
  saveAlert
} from "../lib/api";

const kinds: Record<AlertKind, string> = {
  price_below: "Price below",
  percent_change: "Absolute price change",
  provider_spread: "Provider spread",
  stale_data: "Stale data"
};
const date = (value: string | null) => (value ? new Date(value).toLocaleString() : "Not checked");
const thresholdLabel = (kind: AlertKind) =>
  kind === "stale_data" ? "Age (hours)" : kind === "percent_change" ? "Change (%)" : "Amount (USD)";
const thresholdText = (rule: Pick<AlertRule, "threshold" | "kind">) =>
  rule.threshold === null
    ? "Not set"
    : rule.kind === "stale_data"
      ? `${rule.threshold} hours`
      : rule.kind === "percent_change"
        ? `${rule.threshold}%`
        : `$${rule.threshold.toFixed(2)}`;
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to complete alert request";

export function AlertsDashboard() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<Watchlist | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | undefined>();
  const [itemId, setItemId] = useState("");
  const [kind, setKind] = useState<AlertKind>("price_below");
  const [providerId, setProviderId] = useState("");
  const [threshold, setThreshold] = useState("");
  const form = useRef<HTMLFormElement>(null);

  const reload = useCallback(async () => {
    const [nextRules, history, nextWatchlist] = await Promise.all([
      fetchAlerts(),
      fetchAlertEvents(),
      fetchWatchlist()
    ]);
    setRules(nextRules);
    setEvents(history.events);
    setCursor(history.nextCursor);
    setWatchlist(nextWatchlist);
    setLoaded(true);
  }, []);
  useEffect(() => {
    void reload().catch((error) => setMessage(errorMessage(error)));
  }, [reload]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await reload();
      setMessage(success);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setEditing(undefined);
    setThreshold("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = alertRuleInputSchema.safeParse({
      itemId,
      kind,
      threshold: Number(threshold),
      providerId: providerId || null
    });
    if (!input.success) {
      setMessage(input.error.issues.map((issue) => issue.message).join("; "));
      return;
    }
    await run(
      async () => {
        await saveAlert(input.data, editing);
        reset();
      },
      editing ? "Rule updated and rearmed." : "Alert rule created."
    );
  }
  function edit(rule: AlertRule) {
    setEditing(rule.id);
    setItemId(rule.itemId);
    setKind(rule.kind);
    setProviderId(rule.providerId ?? "");
    setThreshold(rule.threshold?.toString() ?? "");
    form.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    form.current
      ?.querySelector<HTMLInputElement>('input[type="number"]')
      ?.focus({ preventScroll: true });
  }
  const selected = watchlist?.items.find((entry) => entry.item.id === itemId);
  const providers = [
    ...new Set([
      ...(selected?.latestSnapshots.map((snapshot) => snapshot.provider) ?? []),
      ...(providerId ? [providerId] : [])
    ])
  ].sort();

  return (
    <main className="page">
      <div className="shell alerts-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Market Monitor</p>
            <h1>Alerts</h1>
          </div>
          <button
            className="button secondary"
            disabled={busy || !loaded}
            onClick={() =>
              void run(async () => {
                const result = await evaluateAlerts();
                return result;
              }, "Cached conditions checked.")
            }
          >
            <CheckCheck size={18} aria-hidden="true" />
            Check Conditions
          </button>
        </header>
        <p className="status" role="status" aria-live="polite">
          {message ||
            (loaded
              ? `${rules.filter((rule) => rule.status === "active").length} active rules`
              : "Loading alerts...")}
        </p>
        {!loaded && message && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void run(reload, "Alerts loaded.")}
          >
            <RotateCcw size={18} aria-hidden="true" />
            Retry
          </button>
        )}
        <section className="alerts-section" aria-labelledby="rule-form-heading">
          <h2 id="rule-form-heading">{editing ? "Edit Rule" : "New Rule"}</h2>
          {loaded && watchlist?.items.length === 0 ? (
            <p className="muted">
              No watched items. <Link href="/">Watchlist</Link>
            </p>
          ) : null}
          <form ref={form} onSubmit={(event) => void submit(event)}>
            <fieldset className="alert-form" disabled={busy || !loaded}>
              <label>
                Item
                <select
                  className="input"
                  value={itemId}
                  required
                  onChange={(event) => {
                    setItemId(event.target.value);
                    setProviderId("");
                  }}
                >
                  <option value="">Select item</option>
                  {editing && !selected && itemId && (
                    <option value={itemId}>
                      {rules.find((rule) => rule.id === editing)?.marketHashName} (unwatched)
                    </option>
                  )}
                  {watchlist?.items.map((entry) => (
                    <option key={entry.item.id} value={entry.item.id}>
                      {entry.item.marketHashName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Condition
                <select
                  className="input"
                  value={kind}
                  onChange={(event) => {
                    const next = event.target.value as AlertKind;
                    setKind(next);
                    if (next === "provider_spread") setProviderId("");
                  }}
                >
                  {Object.entries(kinds).map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Provider
                <select
                  className="input"
                  value={providerId}
                  disabled={kind === "provider_spread"}
                  required={kind === "percent_change"}
                  onChange={(event) => setProviderId(event.target.value)}
                >
                  <option value="">
                    {kind === "percent_change" ? "Select provider" : "All providers"}
                  </option>
                  {providers.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {thresholdLabel(kind)}
                <input
                  className="input"
                  type="number"
                  required
                  min={kind === "stale_data" ? 1 : 0.01}
                  max={kind === "stale_data" ? 8760 : 9999999999.99}
                  step={kind === "stale_data" ? 1 : 0.01}
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                />
              </label>
              <div className="toolbar">
                <button className="button" type="submit">
                  <Plus size={18} aria-hidden="true" />
                  {editing ? "Save Rule" : "Create Rule"}
                </button>
                {editing && (
                  <button
                    className="button secondary icon-button"
                    type="button"
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
        <section className="alerts-section" aria-labelledby="rules-heading">
          <h2 id="rules-heading">Rules</h2>
          <div className="table-wrap">
            <table className="alerts-table">
              <thead>
                <tr>
                  <th>Item / Condition</th>
                  <th>Threshold / Provider</th>
                  <th>Status</th>
                  <th>Last Evaluation</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <Link className="item-name" href={`/items/${rule.itemId}`}>
                        {rule.marketHashName}
                      </Link>
                      <div className="muted">{kinds[rule.kind]}</div>
                    </td>
                    <td>
                      {thresholdText(rule)}
                      <div className="muted">{rule.providerId ?? "All providers"}</div>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${rule.status === "active" ? "fresh" : rule.status === "triggered" ? "stale" : "neutral"}`}
                      >
                        {rule.status}
                      </span>
                    </td>
                    <td>
                      <time>{date(rule.lastEvaluatedAt)}</time>
                      <div className="muted">{rule.lastEvaluation}</div>
                    </td>
                    <td>
                      <div className="toolbar rule-actions">
                        {rule.status === "triggered" ? (
                          <button
                            className="button secondary icon-button"
                            title="Rearm rule"
                            aria-label={`Rearm ${rule.marketHashName}`}
                            disabled={busy}
                            onClick={() =>
                              void run(() => changeAlertStatus(rule.id, "rearm"), "Rule rearmed.")
                            }
                          >
                            <RotateCcw size={18} />
                          </button>
                        ) : (
                          <label className="rule-switch">
                            <input
                              type="checkbox"
                              aria-label={`Active rule for ${rule.marketHashName}`}
                              checked={rule.status === "active"}
                              disabled={busy}
                              onChange={() =>
                                void run(
                                  () =>
                                    changeAlertStatus(
                                      rule.id,
                                      rule.status === "active" ? "pause" : "resume"
                                    ),
                                  rule.status === "active" ? "Rule paused." : "Rule resumed."
                                )
                              }
                            />
                            Active
                          </label>
                        )}
                        <button
                          className="button secondary icon-button"
                          title="Edit rule"
                          aria-label={`Edit ${rule.marketHashName}`}
                          disabled={busy}
                          onClick={() => edit(rule)}
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          className="button danger icon-button"
                          title="Delete rule"
                          aria-label={`Delete ${rule.marketHashName}`}
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`Delete this rule for ${rule.marketHashName}?`))
                              void run(async () => {
                                await deleteAlert(rule.id);
                                if (editing === rule.id) reset();
                              }, "Rule deleted. History retained.");
                          }}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {loaded && rules.length === 0 && (
                  <tr>
                    <td className="empty" colSpan={5}>
                      No alert rules
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="alerts-section" aria-labelledby="history-heading">
          <h2 id="history-heading">Alert History</h2>
          {loaded && events.length === 0 && <p className="muted">No triggered alerts</p>}
          <ul className="alert-history">
            {events.map((event) => (
              <li key={event.id}>
                <div className="history-heading">
                  <strong>{event.marketHashName}</strong>
                  <time>{date(event.triggeredAt)}</time>
                </div>
                <p>{event.message}</p>
                <span className="muted">
                  {kinds[event.kind]}: {thresholdText(event)} |{" "}
                  {event.providerId ?? "All providers"} | Generation {event.generation}
                </span>
                <details>
                  <summary>Evidence</summary>
                  <p>Armed: {date(event.evidence.armedAt)}</p>
                  {event.evidence.baseline && (
                    <p>
                      Baseline: {event.evidence.baseline.provider} $
                      {event.evidence.baseline.lowestAsk?.toFixed(2)} | Source:{" "}
                      {date(event.evidence.baseline.sourceUpdatedAt)}
                    </p>
                  )}
                  {event.evidence.snapshots.map((snapshot) => (
                    <p key={snapshot.id}>
                      {snapshot.provider}:{" "}
                      {snapshot.lowestAsk === null ? "No ask" : `$${snapshot.lowestAsk.toFixed(2)}`}{" "}
                      | Source:{" "}
                      {snapshot.sourceUpdatedAt ? date(snapshot.sourceUpdatedAt) : "Unknown"} |
                      Collected: {date(snapshot.collectedAt)}
                      <br />
                      <small>Snapshot {snapshot.id}</small>
                    </p>
                  ))}
                </details>
              </li>
            ))}
          </ul>
          {cursor && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void fetchAlertEvents(cursor)
                  .then((history) => {
                    setEvents((current) => [...current, ...history.events]);
                    setCursor(history.nextCursor);
                  })
                  .catch((error) => setMessage(errorMessage(error)))
                  .finally(() => setBusy(false));
              }}
            >
              Load More
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
