import { fileURLToPath } from "node:url";
import { createDb, items, priceSnapshots, syncRuns, watchlistItems } from "@csst/db";
import type { Database } from "@csst/db";
import { watchlistImportSchema } from "@csst/shared";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { WatchlistsRepository } from "../src/watchlists/watchlists.repository.js";
import type { SnapshotInput } from "../src/watchlists/watchlists.repository.js";

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl && !new URL(testUrl).pathname.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL must target a dedicated database whose name ends in _test");
}

describe.skipIf(!testUrl)("WatchlistsRepository with Postgres", () => {
  let db: Database;
  let repository: WatchlistsRepository;

  beforeAll(async () => {
    db = createDb(testUrl!);
    repository = new WatchlistsRepository(db);
    const migrationsFolder = fileURLToPath(
      new URL("../../../packages/db/drizzle", import.meta.url)
    );
    await migrate(db, { migrationsFolder });
    // Applying migrations twice must be safe on an already migrated database.
    await migrate(db, { migrationsFolder });
  }, 30000);

  beforeEach(async () => {
    await db.delete(syncRuns);
    await db.delete(priceSnapshots);
    await db.delete(watchlistItems);
    await db.delete(items);
  });

  afterAll(async () => {
    await db?.$client.end();
  });

  it("reserves only the final monthly slot under concurrent requests", async () => {
    const entries = await Promise.all(
      Array.from({ length: 6 }, (_, i) => repository.addItem(`Test Skin ${i}`))
    );
    const results = await Promise.all(
      entries.map((entry) =>
        repository.reserveSyncRun({
          itemId: entry.item.id,
          marketHashName: entry.item.marketHashName,
          monthlyLimit: 1,
          cooldownSeconds: 3600
        })
      )
    );
    expect(results.filter((result) => result.status === "reserved")).toHaveLength(1);
    expect(await repository.getMonthlyRequestUsage()).toBe(1);
  });

  it("dates a reservation in the quota-check month after waiting across the boundary", async () => {
    const entry = await repository.addItem("Boundary Skin");
    const other = await repository.addItem("Other Boundary Skin");
    const realNow = new Date();
    const boundary = new Date(Date.UTC(realNow.getUTCFullYear(), realNow.getUTCMonth() + 1, 1));
    let release!: () => void;
    let acquired!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const blocker = db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('csst:cs2cap:budget'))`);
      acquired();
      await hold;
    });
    await locked;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(boundary.getTime() - 1000));
    const pending = repository.reserveSyncRun({
      itemId: entry.item.id,
      marketHashName: entry.item.marketHashName,
      monthlyLimit: 1,
      cooldownSeconds: 3600
    });
    try {
      await expect
        .poll(
          async () => {
            const rows = await db.execute(
              sql`select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event = 'advisory'`
            );
            return Number(rows[0]?.waiting ?? 0);
          },
          { timeout: 3000, interval: 10 }
        )
        .toBeGreaterThan(0);
      vi.setSystemTime(boundary);
      release();
      expect(await pending).toMatchObject({ status: "reserved" });
      const [row] = await db.select().from(syncRuns);
      expect(row?.startedAt).toEqual(boundary);
      expect(await repository.getMonthlyRequestUsage(boundary)).toBe(1);
      expect(
        await repository.reserveSyncRun({
          itemId: other.item.id,
          marketHashName: other.item.marketHashName,
          monthlyLimit: 1,
          cooldownSeconds: 3600
        })
      ).toEqual({ status: "skipped", reason: "CS2Cap monthly request budget is exhausted" });
    } finally {
      release();
      try {
        await Promise.all([blocker, pending]);
      } finally {
        vi.useRealTimers();
      }
    }
  }, 10000);

  it("enforces item cooldown across concurrent requests and after a failed sync", async () => {
    const entry = await repository.addItem("AK-47 | Redline (Field-Tested)");
    const input = {
      itemId: entry.item.id,
      marketHashName: entry.item.marketHashName,
      monthlyLimit: 1000,
      cooldownSeconds: 3600
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => repository.reserveSyncRun(input))
    );
    const reservation = results.find((result) => result.status === "reserved");
    expect(results.filter((result) => result.status === "reserved")).toHaveLength(1);
    if (reservation?.status !== "reserved") throw new Error("Expected reservation");
    await repository.finishSyncRun({
      id: reservation.id,
      status: "failed",
      snapshotsCreated: 0,
      responseStatus: 429,
      rateLimitRemaining: 0
    });
    expect(await repository.reserveSyncRun(input)).toMatchObject({ status: "skipped" });
    expect(await repository.getMonthlyRequestUsage()).toBe(1);
    const [row] = await db.select().from(syncRuns);
    expect(row).toMatchObject({
      status: "failed",
      responseStatus: 429,
      rateLimitRemaining: 0,
      requestCost: 1
    });
  });

  it("returns every latest provider quote despite uneven item refresh histories", async () => {
    const frequent = await repository.addItem("Frequent Skin");
    const quiet = await repository.addItem("Quiet Skin");
    const now = new Date();
    const old = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const makeSnapshot = (
      itemId: string,
      providerId: string,
      collectedAt: Date,
      lowestAsk: number,
      sourceUpdatedAt: Date | null = collectedAt
    ): SnapshotInput => ({
      itemId,
      providerId,
      collectedAt,
      sourceUpdatedAt,
      lowestAsk,
      highestBid: null,
      askVolume: null,
      bidVolume: null,
      currency: "USD",
      rawPayload: {}
    });
    await repository.createSnapshots([
      makeSnapshot(quiet.item.id, "steam", old, 30),
      makeSnapshot(frequent.item.id, "skinport", old, 40),
      ...Array.from({ length: 120 }, (_, i) =>
        makeSnapshot(frequent.item.id, "steam", new Date(now.getTime() - (120 - i) * 1000), i + 1)
      ),
      makeSnapshot(frequent.item.id, "csfloat", now, 20, old),
      makeSnapshot(frequent.item.id, "csmoney_m", now, 25, null)
    ]);
    const watchlist = await repository.getDefaultWatchlist();
    const frequentSnapshots = watchlist.items.find(
      (entry) => entry.item.id === frequent.item.id
    )?.latestSnapshots;
    const quietSnapshots = watchlist.items.find(
      (entry) => entry.item.id === quiet.item.id
    )?.latestSnapshots;
    expect(frequentSnapshots).toHaveLength(4);
    expect(frequentSnapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "steam", lowestAsk: 120, freshness: "fresh" }),
        expect.objectContaining({ provider: "skinport", lowestAsk: 40, freshness: "stale" }),
        expect.objectContaining({ provider: "csfloat", lowestAsk: 20, freshness: "stale" }),
        expect.objectContaining({ provider: "csmoney_m", freshness: "unknown" })
      ])
    );
    expect(quietSnapshots).toEqual([expect.objectContaining({ provider: "steam", lowestAsk: 30 })]);
    expect((await repository.getItemHistory(frequent.item.id)).snapshots).toHaveLength(123);
  });

  it("merges imports without duplicates and retains existing canonical names", async () => {
    await repository.addItem("AK-47 | Redline (Field-Tested)");
    expect(
      await repository.importItems([
        "ak-47 | redline (field-tested)",
        "AWP | Asiimov (Field-Tested)",
        "AWP   | Asiimov (Field-Tested)"
      ])
    ).toEqual({ added: 1, skipped: 2, total: 2 });
    expect(await repository.importItems(["AWP | Asiimov (Field-Tested)"])).toEqual({
      added: 0,
      skipped: 1,
      total: 2
    });
    const watchlist = await repository.getDefaultWatchlist();
    expect(
      watchlist.items.find((entry) => entry.item.marketHashName.startsWith("AK-47"))
    ).toBeDefined();
    expect(await repository.getMonthlyRequestUsage()).toBe(0);
  });

  it("deduplicates concurrent adds of the same normalized item", async () => {
    const added = await Promise.all(
      Array.from({ length: 6 }, (_, i) => repository.addItem(i % 2 ? "Test Skin" : "test skin"))
    );
    expect(new Set(added.map((entry) => entry.item.id)).size).toBe(1);
    expect((await repository.getDefaultWatchlist()).items).toHaveLength(1);
  });

  it("rolls back the entire import if a later item fails", async () => {
    await db.execute(
      sql`alter table items add constraint test_rejected_skin check (market_hash_name <> 'ZZZ Rejected Skin')`
    );
    try {
      await expect(
        repository.importItems(["AAA Valid Skin", "ZZZ Rejected Skin"])
      ).rejects.toThrow();
      expect((await repository.getDefaultWatchlist()).items).toHaveLength(0);
      expect(await db.select().from(items)).toHaveLength(0);
    } finally {
      await db.execute(sql`alter table items drop constraint test_rejected_skin`);
    }
  });

  it("rejects a valid 1000-item merge that would make the export unimportable", async () => {
    await repository.addItem("Existing Skin");
    const names = Array.from({ length: 1000 }, (_, i) => `Imported Skin ${i}`);
    expect(watchlistImportSchema.parse({ version: 1, items: names }).items).toHaveLength(1000);
    await expect(repository.importItems(names)).rejects.toThrow("at most 1000");
    expect(
      (await repository.getWatchlistEntries()).map((entry) => entry.item.marketHashName)
    ).toEqual(["Existing Skin"]);
    expect(await db.select().from(items)).toHaveLength(1);
  });

  it("shares the final watchlist slot between concurrent adds and imports, keeping exports importable", async () => {
    const watchlist = await repository.getDefaultWatchlist();
    const fixtureItems = await db
      .insert(items)
      .values(
        Array.from({ length: 999 }, (_, i) => ({
          marketHashName: `Seed Skin ${i}`,
          normalizedMarketHashName: `seed skin ${i}`
        }))
      )
      .returning({ id: items.id });
    await db
      .insert(watchlistItems)
      .values(fixtureItems.map((item) => ({ watchlistId: watchlist.id, itemId: item.id })));
    const results = await Promise.allSettled([
      repository.addItem("Added Skin"),
      repository.importItems(["Imported Skin"])
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const backup = {
      version: 1,
      items: (await repository.getWatchlistEntries()).map((entry) => entry.item.marketHashName)
    };
    const parsed = watchlistImportSchema.parse(JSON.parse(JSON.stringify(backup)));
    expect(parsed.items).toHaveLength(1000);
    expect(await repository.importItems(parsed.items)).toEqual({
      added: 0,
      skipped: 1000,
      total: 1000
    });
    await expect(repository.addItem("One Too Many")).rejects.toThrow("at most 1000");
    await db.delete(watchlistItems);
    expect(await repository.importItems(parsed.items)).toEqual({
      added: 1000,
      skipped: 0,
      total: 1000
    });
    expect(
      new Set((await repository.getWatchlistEntries()).map((entry) => entry.item.marketHashName))
    ).toEqual(new Set(parsed.items));
  }, 30000);
});
