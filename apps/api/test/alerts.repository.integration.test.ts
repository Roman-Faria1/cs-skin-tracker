import { fileURLToPath } from "node:url";
import {
  alertEvents,
  alerts,
  createDb,
  items,
  priceSnapshots,
  syncRuns,
  watchlistItems
} from "@csst/db";
import type { Database } from "@csst/db";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AlertsRepository } from "../src/alerts/alerts.repository.js";
import { WatchlistsRepository } from "../src/watchlists/watchlists.repository.js";

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("TEST_DATABASE_URL must end in _test");

describe.skipIf(!url)("AlertsRepository with Postgres", () => {
  let db: Database;
  let repository: AlertsRepository;
  let watchlists: WatchlistsRepository;
  beforeAll(async () => {
    db = createDb(url!);
    repository = new AlertsRepository(db);
    watchlists = new WatchlistsRepository(db);
    const migrationsFolder = fileURLToPath(
      new URL("../../../packages/db/drizzle", import.meta.url)
    );
    await migrate(db, { migrationsFolder });
    await migrate(db, { migrationsFolder });
  }, 30000);
  beforeEach(async () => {
    await db.delete(alertEvents);
    await db.delete(alerts);
    await db.delete(syncRuns);
    await db.delete(priceSnapshots);
    await db.delete(watchlistItems);
    await db.delete(items);
  });
  afterAll(async () => {
    await db?.$client.end();
  });

  async function quote(itemId: string, price: number, at = new Date(), source = at) {
    await watchlists.createSnapshots([
      {
        itemId,
        providerId: "steam",
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
  async function setup() {
    const entry = await watchlists.addItem("AK-47 | Redline (Field-Tested)");
    await quote(entry.item.id, 10);
    const rule = await repository.save({
      itemId: entry.item.id,
      kind: "price_below",
      threshold: 11,
      providerId: null
    });
    return { entry, rule };
  }

  it("fires exactly once across concurrent evaluations, then once per rearm", async () => {
    const { rule } = await setup();
    const results = await Promise.all(Array.from({ length: 5 }, () => repository.evaluate()));
    expect(results.reduce((total, result) => total + result.triggered, 0)).toBe(1);
    expect((await repository.list())[0]?.status).toBe("triggered");
    const rearmed = await repository.action(rule.id, "rearm");
    expect(rearmed.generation).toBe(2);
    expect(await repository.evaluate()).toEqual({ evaluated: 1, triggered: 1 });
    expect((await repository.history()).events.map((event) => event.generation).sort()).toEqual([
      1, 2
    ]);
  });
  it("pauses, resumes and rejects invalid transitions", async () => {
    const { rule } = await setup();
    await repository.action(rule.id, "pause");
    expect((await repository.evaluate()).triggered).toBe(0);
    await expect(repository.action(rule.id, "rearm")).rejects.toThrow("Cannot rearm");
    await repository.action(rule.id, "resume");
    expect((await repository.evaluate()).triggered).toBe(1);
    await expect(repository.action(rule.id, "pause")).rejects.toThrow("Cannot pause");
  });
  it("preserves immutable configuration and evidence after editing and deleting", async () => {
    const { rule, entry } = await setup();
    await repository.evaluate();
    const original = (await repository.history()).events[0]!;
    await repository.save(
      { itemId: entry.item.id, kind: "price_below", threshold: 9, providerId: "steam" },
      rule.id
    );
    expect((await repository.list())[0]).toMatchObject({
      generation: 2,
      status: "active",
      threshold: 9
    });
    expect((await repository.history()).events[0]).toEqual(original);
    await repository.remove(rule.id);
    await db.delete(items).where(eq(items.id, entry.item.id));
    expect((await repository.history()).events[0]).toEqual({
      ...original,
      alertId: null,
      itemId: null
    });
  });
  it("captures a percent baseline and requires a newly updated source quote", async () => {
    const entry = await watchlists.addItem("Percent Skin");
    const input = {
      itemId: entry.item.id,
      kind: "percent_change" as const,
      threshold: 5,
      providerId: "steam"
    };
    await expect(repository.save(input)).rejects.toThrow("fresh");
    const past = new Date(Date.now() - 60000);
    await quote(entry.item.id, 100, past);
    const rule = await repository.save(input);
    expect(rule.baselineSnapshot?.lowestAsk).toBe(100);
    await quote(entry.item.id, 90, new Date(Date.now() - 1000), past);
    expect((await repository.evaluate()).triggered).toBe(0);
    await quote(entry.item.id, 95);
    expect((await repository.evaluate()).triggered).toBe(1);
    expect((await repository.history()).events[0]?.observedValue).toBe(-5);
  });
  it("ignores unwatched items and rejects new rules for them", async () => {
    const { entry } = await setup();
    await watchlists.removeItem(entry.id);
    expect((await repository.evaluate()).triggered).toBe(0);
    expect((await repository.list())[0]?.lastEvaluation).toBe("Item is no longer watched");
    await expect(
      repository.save({
        itemId: entry.item.id,
        kind: "price_below",
        threshold: 12,
        providerId: null
      })
    ).rejects.toThrow("watchlist");
  });
  it("fires stale rules from old source dates without requesting prices", async () => {
    const entry = await watchlists.addItem("Stale Skin");
    await quote(entry.item.id, 10, new Date(), new Date(Date.now() - 25 * 3600000));
    await repository.save({
      itemId: entry.item.id,
      kind: "stale_data",
      threshold: 24,
      providerId: "steam"
    });
    expect((await repository.evaluate()).triggered).toBe(1);
    expect((await repository.history()).events[0]?.evidence.snapshots).toHaveLength(1);
  });

  it("rolls back lifecycle updates if history persistence fails", async () => {
    const { rule, entry } = await setup();
    await db.insert(alertEvents).values({
      alertId: rule.id,
      itemId: entry.item.id,
      marketHashName: entry.item.marketHashName,
      kind: rule.kind,
      generation: rule.generation,
      threshold: "11.00",
      providerId: null,
      observedValue: "10.00",
      message: "Existing event",
      triggeredAt: new Date(),
      evidence: { snapshots: [], baseline: null, armedAt: rule.armedAt }
    });
    await expect(repository.evaluate()).rejects.toThrow();
    expect((await repository.list())[0]).toMatchObject({ status: "active", lastEvaluatedAt: null });
    expect((await repository.history()).events).toHaveLength(1);
  });
  it("paginates tied timestamps without duplicates and rejects invalid cursors", async () => {
    const { rule, entry } = await setup();
    await db.insert(alertEvents).values(
      Array.from({ length: 51 }, (_, index) => ({
        alertId: rule.id,
        itemId: entry.item.id,
        marketHashName: entry.item.marketHashName,
        kind: "price_below" as const,
        generation: index + 1,
        threshold: "11.00",
        providerId: null,
        observedValue: "10.00",
        message: "Test event",
        triggeredAt: new Date(rule.armedAt),
        evidence: { snapshots: [], baseline: null, armedAt: rule.armedAt }
      }))
    );
    const first = await repository.history();
    const second = await repository.history(first.nextCursor!);
    expect(first.events).toHaveLength(50);
    expect(second.events).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.events, ...second.events].map((event) => event.id)).size).toBe(51);
    await expect(repository.history("bad cursor")).rejects.toThrow("Invalid alert history cursor");
  });
});
