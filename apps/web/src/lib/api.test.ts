// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { addWatchlistItem, importWatchlist, evaluateAlerts, fetchAlerts, saveAlert } from "./api";
import { fetchPortfolio, saveHolding } from "./api";

afterEach(() => vi.unstubAllGlobals());

it("validates portfolio responses and preserves holding validation errors", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ invalid: true }));
  vi.stubGlobal("fetch", fetch);
  await expect(fetchPortfolio("steam")).rejects.toThrow();
  expect(fetch).toHaveBeenCalledWith(
    "http://localhost:4000/portfolio?providerId=steam",
    expect.objectContaining({ method: "GET" })
  );
  fetch.mockResolvedValue(
    Response.json(
      { message: "Add the item to the watchlist before creating a holding" },
      { status: 400 }
    )
  );
  await expect(
    saveHolding({
      itemId: "00000000-0000-4000-8000-000000000201",
      quantity: 1,
      acquisitionPrice: null,
      notes: null
    })
  ).rejects.toThrow("watchlist");
});

it("validates alert responses and propagates provider-baseline errors", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ evaluated: 2, triggered: 1 }));
  vi.stubGlobal("fetch", fetch);
  expect(await evaluateAlerts()).toEqual({ evaluated: 2, triggered: 1 });
  expect(fetch).toHaveBeenCalledWith(
    "http://localhost:4000/alerts/evaluate",
    expect.objectContaining({ method: "POST" })
  );
  fetch.mockResolvedValue(Response.json({ invalid: true }));
  await expect(fetchAlerts()).rejects.toThrow();
  fetch.mockResolvedValue(
    Response.json({ message: "A fresh baseline is required" }, { status: 400 })
  );
  await expect(
    saveAlert({
      itemId: "00000000-0000-4000-8000-000000000201",
      kind: "percent_change",
      threshold: 5,
      providerId: "steam"
    })
  ).rejects.toThrow("A fresh baseline is required");
});

it("shows the server's capacity error when a merge or individual add is rejected", async () => {
  const message = "Watchlist can contain at most 1000 items; no items were added";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => Promise.resolve(Response.json({ message }, { status: 400 })))
  );
  await expect(importWatchlist({ version: 1, items: ["AK-47 | Redline"] })).rejects.toThrow(
    message
  );
  await expect(addWatchlistItem({ marketHashName: "AK-47 | Redline" })).rejects.toThrow(message);
});

it("keeps a useful fallback for non-JSON server errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(() => Promise.resolve(new Response("unavailable", { status: 503 })))
  );
  await expect(importWatchlist({ version: 1, items: [] })).rejects.toThrow(
    "Unable to import watchlist: 503"
  );
});
