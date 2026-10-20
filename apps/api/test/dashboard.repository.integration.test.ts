import { fileURLToPath } from "node:url";
import { createDb, items, priceSnapshots, syncRuns, watchlistItems } from "@csst/db";
import type { Database } from "@csst/db";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardRepository } from "../src/dashboard/dashboard.repository.js";
import { WatchlistsRepository } from "../src/watchlists/watchlists.repository.js";

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("TEST_DATABASE_URL must end in _test");
const now = new Date("2026-10-18T12:00:00Z");
describe.skipIf(!url)("DashboardRepository with Postgres", () => {
  let db: Database;
  let repository: DashboardRepository;
  let watchlists: WatchlistsRepository;
  beforeAll(async () => {
    db = createDb(url!);
    repository = new DashboardRepository(db);
    watchlists = new WatchlistsRepository(db);
    const migrationsFolder = fileURLToPath(
      new URL("../../../packages/db/drizzle", import.meta.url)
    );
    await migrate(db, { migrationsFolder });
    await migrate(db, { migrationsFolder });
  }, 30000);
  beforeEach(async () => {
    await db.delete(syncRuns);
    await db.delete(priceSnapshots);
    await db.delete(watchlistItems);
    await db.delete(items);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    await db?.$client.end();
  });
  const report = (window: "24h" | "7d" = "24h", providerId: string | null = null) =>
    repository.movement({ window, providerId });
  async function quote(
    itemId: string,
    providerId: string,
    price: number | null,
    hours: number,
    sourceHours: number | null = hours,
    id?: string
  ) {
    await watchlists.ensureProvider(providerId);
    await db.insert(priceSnapshots).values({
      ...(id ? { id } : {}),
      itemId,
      providerId,
      lowestAsk: price === null ? null : price.toFixed(2),
      collectedAt: new Date(now.getTime() + hours * 3600000),
      sourceUpdatedAt: sourceHours === null ? null : new Date(now.getTime() + sourceHours * 3600000)
    });
  }
  it("selects latest snapshots at/before the cutoff without looking ahead or spending quota", async () => {
    const entry = await watchlists.addItem("Cutoff Skin");
    await quote(entry.item.id, "steam", 1, -30);
    await quote(entry.item.id, "steam", 10, -24);
    await quote(entry.item.id, "steam", 99, -23);
    await quote(entry.item.id, "steam", 12, 0);
    const result = await report();
    expect(result.items[0]).toMatchObject({
      status: "comparable",
      changePercent: 20,
      baseline: { lowestAsk: 10 }
    });
    expect(result.comparisonAt).toBe("2026-10-17T12:00:00.000Z");
    expect(await watchlists.getMonthlyRequestUsage()).toBe(0);
  });
  it("uses the cheapest fresh current provider's own history, not another market", async () => {
    const entry = await watchlists.addItem("Provider Skin");
    await quote(entry.item.id, "steam", 5, -24);
    await quote(entry.item.id, "steam", 11, 0);
    await quote(entry.item.id, "skinport", 10, -24);
    await quote(entry.item.id, "skinport", 9, 0);
    expect((await report()).items[0]).toMatchObject({ providerId: "skinport", changePercent: -10 });
    expect((await report("24h", "steam")).items[0]).toMatchObject({
      providerId: "steam",
      changePercent: 120
    });
    await expect(report("24h", "not-a-market")).rejects.toThrow("Unknown market provider");
  });
  it("bounds baseline lag to 24 hours, including the exact boundary", async () => {
    const entry = await watchlists.addItem("Sparse Skin");
    await quote(entry.item.id, "steam", 10, -48.001);
    await quote(entry.item.id, "steam", 12, 0);
    expect((await report()).items[0]?.status).toBe("missing_baseline");
    await quote(entry.item.id, "steam", 10, -48);
    expect((await report()).items[0]?.status).toBe("comparable");
  });
  it("does not fall back to an older priced row when latest baseline data is missing", async () => {
    const entry = await watchlists.addItem("Missing Ask Skin");
    await quote(entry.item.id, "steam", 10, -25);
    await quote(entry.item.id, "steam", null, -24);
    await quote(entry.item.id, "steam", 12, 0);
    expect((await report()).items[0]).toMatchObject({
      status: "missing_baseline",
      baseline: { lowestAsk: null }
    });
  });
  it("selects the seven-day cutoff independently and breaks snapshot ties by UUID", async () => {
    const entry = await watchlists.addItem("Weekly Skin");
    await quote(entry.item.id, "steam", 5, -168, -168, "00000000-0000-4000-8000-000000000301");
    await quote(entry.item.id, "steam", 10, -168, -168, "00000000-0000-4000-8000-000000000302");
    await quote(entry.item.id, "steam", 15, 0);
    expect((await report("7d")).items[0]).toMatchObject({
      changePercent: 50,
      baseline: { lowestAsk: 10 }
    });
    expect((await report()).items[0]?.status).toBe("missing_baseline");
  });
  it("excludes unwatched catalog items and returns valid empty coverage", async () => {
    const entry = await watchlists.addItem("Removed Skin");
    await quote(entry.item.id, "steam", 10, -24);
    await quote(entry.item.id, "steam", 12, 0);
    await watchlists.removeItem(entry.id);
    expect((await report()).summary).toEqual({
      watchedItems: 0,
      comparableItems: 0,
      excludedItems: 0,
      up: 0,
      down: 0,
      flat: 0
    });
  });
});
