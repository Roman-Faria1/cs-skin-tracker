// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { addWatchlistItem, importWatchlist } from "./api";

afterEach(() => vi.unstubAllGlobals());

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
