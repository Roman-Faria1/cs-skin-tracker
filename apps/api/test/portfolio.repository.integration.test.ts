import { fileURLToPath } from "node:url";
import {
  createDb,
  items,
  portfolioItems,
  priceSnapshots,
  syncRuns,
  watchlistItems
} from "@csst/db";
import type { Database } from "@csst/db";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PortfolioRepository } from "../src/portfolio/portfolio.repository.js";
import { WatchlistsRepository } from "../src/watchlists/watchlists.repository.js";

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("TEST_DATABASE_URL must end in _test");
describe.skipIf(!url)("PortfolioRepository with Postgres", () => {
  let db: Database;
  let repository: PortfolioRepository;
  let watchlists: WatchlistsRepository;
  beforeAll(async () => {
    db = createDb(url!);
    repository = new PortfolioRepository(db);
    watchlists = new WatchlistsRepository(db);
    const migrationsFolder = fileURLToPath(
      new URL("../../../packages/db/drizzle", import.meta.url)
    );
    await migrate(db, { migrationsFolder });
    await migrate(db, { migrationsFolder });
  }, 30000);
  beforeEach(async () => {
    await db.delete(portfolioItems);
    await db.delete(syncRuns);
    await db.delete(priceSnapshots);
    await db.delete(watchlistItems);
    await db.delete(items);
  });
  afterAll(async () => {
    await db?.$client.end();
  });

  async function setup() {
    const entry = await watchlists.addItem("AK-47 | Redline (Field-Tested)");
    const holding = await repository.save({
      itemId: entry.item.id,
      quantity: 2,
      acquisitionPrice: 8.25,
      notes: "First lot"
    });
    return { entry, holding };
  }
  async function quote(
    itemId: string,
    providerId = "steam",
    price = 10,
    at = new Date(),
    source: Date | null = at
  ) {
    await watchlists.createSnapshots([
      {
        itemId,
        providerId,
        lowestAsk: price,
        highestBid: null,
        askVolume: null,
        bidVolume: null,
        currency: "USD",
        rawPayload: {},
        collectedAt: at,
        sourceUpdatedAt: source
      }
    ]);
  }
  it("persists separate lots, edits and deletes without changing watchlists or spending quota", async () => {
    const { entry, holding } = await setup();
    await repository.save({
      itemId: entry.item.id,
      quantity: 1,
      acquisitionPrice: null,
      notes: null
    });
    expect((await repository.list()).holdings).toHaveLength(2);
    await repository.save(
      { itemId: entry.item.id, quantity: 3, acquisitionPrice: 0, notes: "Gift" },
      holding.id
    );
    expect((await repository.list()).holdings.find((row) => row.id === holding.id)).toMatchObject({
      quantity: 3,
      acquisitionPrice: 0,
      notes: "Gift"
    });
    await repository.remove(holding.id);
    expect((await repository.list()).holdings).toHaveLength(1);
    expect(await watchlists.getMonthlyRequestUsage()).toBe(0);
    expect((await watchlists.getWatchlistEntries()).map((row) => row.item.id)).toEqual([
      entry.item.id
    ]);
  });
  it("uses only the latest row per provider and recalculates from cached snapshots", async () => {
    const { entry } = await setup();
    await quote(entry.item.id, "steam", 1, new Date(Date.now() - 10000));
    await quote(entry.item.id, "steam", 12);
    await quote(entry.item.id, "skinport", 10);
    const portfolio = await repository.list();
    expect(portfolio.summary).toMatchObject({
      grossAskValue: "20.00",
      knownCostBasis: "16.50",
      unrealizedPnl: "3.50",
      valuationStatus: "complete"
    });
    expect(portfolio.holdings[0]?.quote?.provider).toBe("skinport");
    expect((await repository.list("steam")).summary.grossAskValue).toBe("24.00");
    await expect(repository.list("not-a-market")).rejects.toThrow("Unknown market provider");
  });
  it("retains holdings and permits lot edits after unwatching but rejects new unwatched lots", async () => {
    const { entry, holding } = await setup();
    await quote(entry.item.id);
    await watchlists.removeItem(entry.id);
    expect((await repository.list()).holdings[0]).toMatchObject({
      isWatched: false,
      marketValue: "20.00"
    });
    await repository.save(
      { itemId: entry.item.id, quantity: 4, acquisitionPrice: null, notes: null },
      holding.id
    );
    expect((await repository.list()).summary.grossAskValue).toBe("40.00");
    await expect(
      repository.save({ itemId: entry.item.id, quantity: 1, acquisitionPrice: null, notes: null })
    ).rejects.toThrow("watchlist");
  });
  it("preserves cost basis while marking stale/unknown/missing prices unvalued", async () => {
    const { entry } = await setup();
    expect((await repository.list()).holdings[0]?.valuationStatus).toBe("missing");
    await quote(entry.item.id, "steam", 10, new Date(), new Date(Date.now() - 25 * 3600000));
    expect((await repository.list()).holdings[0]).toMatchObject({
      valuationStatus: "stale",
      marketValue: null,
      costBasis: "16.50"
    });
    await quote(entry.item.id, "skinport", 8, new Date(), null);
    expect((await repository.list("skinport")).holdings[0]?.valuationStatus).toBe("unknown");
    expect((await repository.list()).summary).toMatchObject({
      grossAskValue: null,
      knownCostBasis: "16.50",
      unrealizedPnl: null
    });
  });
  it("returns not found for nonexistent updates/deletes without creating a lot", async () => {
    const { entry } = await setup();
    const absent = "00000000-0000-4000-8000-000000000999";
    await expect(
      repository.save(
        { itemId: entry.item.id, quantity: 1, acquisitionPrice: null, notes: null },
        absent
      )
    ).rejects.toThrow("Holding not found");
    await expect(repository.remove(absent)).rejects.toThrow("Holding not found");
    expect((await repository.list()).holdings).toHaveLength(1);
  });
  it("protects the final holding slot under concurrent creates", async () => {
    const { entry, holding } = await setup();
    await db
      .insert(portfolioItems)
      .values(Array.from({ length: 998 }, () => ({ itemId: entry.item.id, quantity: "1" })));
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        repository.save({ itemId: entry.item.id, quantity: 1, acquisitionPrice: null, notes: null })
      )
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await repository.list()).holdings).toHaveLength(1000);
    await repository.save(
      { itemId: entry.item.id, quantity: 3, acquisitionPrice: 1, notes: null },
      holding.id
    );
    expect((await repository.list()).holdings.find((row) => row.id === holding.id)?.quantity).toBe(
      3
    );
  });
});
