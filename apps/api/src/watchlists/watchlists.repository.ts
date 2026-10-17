import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  items,
  marketProviders,
  priceSnapshots,
  syncRuns,
  watchlistItems,
  watchlists
} from "@csst/db";
import type { Database } from "@csst/db";
import { WATCHLIST_ITEM_LIMIT } from "@csst/shared";
import type {
  ImportWatchlistResponse,
  ItemHistory,
  PriceSnapshot,
  Watchlist,
  WatchlistItem
} from "@csst/shared";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { DATABASE } from "../db/db.module.js";
import { getSnapshotFreshness, parseNullableNumber } from "./watchlists.utils.js";

const DEFAULT_WATCHLIST_ID = "00000000-0000-4000-8000-000000000001";
const DEFAULT_WATCHLIST_NAME = "Default";
const CS2CAP_PROVIDER_ID = "cs2cap";

export interface SnapshotInput {
  itemId: string;
  providerId: string;
  lowestAsk: number | null;
  highestBid: number | null;
  askVolume: number | null;
  bidVolume: number | null;
  currency: "USD";
  rawPayload: unknown;
  sourceUpdatedAt: Date | null;
  collectedAt: Date;
}

export interface SyncRunInput {
  itemId: string;
  marketHashName: string;
  monthlyLimit: number;
  cooldownSeconds: number;
}

export type SyncReservation =
  | { status: "reserved"; id: string }
  | { status: "skipped"; reason: string };

export interface FinishSyncRunInput {
  id: string;
  status: "succeeded" | "failed";
  snapshotsCreated: number;
  responseStatus?: number | null;
  rateLimitLimit?: number | null;
  rateLimitRemaining?: number | null;
  rateLimitResetAt?: Date | null;
  errorMessage?: string | null;
}

@Injectable()
export class WatchlistsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getDefaultWatchlist(): Promise<Watchlist> {
    await this.ensureDefaultWatchlist();

    const entries = await this.getWatchlistEntries();
    const latestSnapshots = await this.getLatestSnapshots(entries.map((entry) => entry.item.id));

    return {
      id: DEFAULT_WATCHLIST_ID,
      name: DEFAULT_WATCHLIST_NAME,
      items: entries.map((entry) => ({
        ...entry,
        latestSnapshots: latestSnapshots.get(entry.item.id) ?? []
      }))
    };
  }

  async getWatchlistEntries(itemIds?: string[]): Promise<WatchlistItem[]> {
    await this.ensureDefaultWatchlist();

    const rows = await this.db
      .select({
        watchlistItemId: watchlistItems.id,
        itemId: items.id,
        marketHashName: items.marketHashName,
        imageUrl: items.imageUrl,
        createdAt: items.createdAt
      })
      .from(watchlistItems)
      .innerJoin(items, eq(watchlistItems.itemId, items.id))
      .where(
        itemIds === undefined
          ? eq(watchlistItems.watchlistId, DEFAULT_WATCHLIST_ID)
          : and(
              eq(watchlistItems.watchlistId, DEFAULT_WATCHLIST_ID),
              inArray(watchlistItems.itemId, itemIds)
            )
      )
      .orderBy(items.marketHashName);

    return rows.map((row) => ({
      id: row.watchlistItemId,
      item: {
        id: row.itemId,
        marketHashName: row.marketHashName,
        imageUrl: row.imageUrl,
        createdAt: row.createdAt.toISOString()
      },
      latestSnapshots: []
    }));
  }

  async getItemHistory(itemId: string): Promise<ItemHistory> {
    const [entry] = await this.getWatchlistEntries([itemId]);

    if (entry === undefined) {
      throw new NotFoundException("Watchlist item not found");
    }

    const snapshots = await this.getSnapshotsForItem(itemId);

    return {
      item: entry.item,
      snapshots
    };
  }

  async addItem(marketHashName: string): Promise<WatchlistItem> {
    await this.importItems([marketHashName]);
    const [item] = await this.db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.normalizedMarketHashName, normalizeMarketHashName(marketHashName)))
      .limit(1);
    const existing = item === undefined ? [] : await this.getWatchlistEntries([item.id]);
    if (existing[0] === undefined) {
      throw new NotFoundException("Watchlist item not found after insert");
    }

    return existing[0];
  }

  async removeItem(id: string): Promise<{ removed: true }> {
    const [removed] = await this.db
      .delete(watchlistItems)
      .where(and(eq(watchlistItems.id, id), eq(watchlistItems.watchlistId, DEFAULT_WATCHLIST_ID)))
      .returning({ id: watchlistItems.id });

    if (removed === undefined) {
      throw new NotFoundException("Watchlist item not found");
    }

    return { removed: true };
  }

  async importItems(names: string[]): Promise<ImportWatchlistResponse> {
    await this.ensureDefaultWatchlist();
    return this.db.transaction(async (tx) => {
      // Adds and merges share this lock so concurrent writes cannot exceed export capacity.
      await tx
        .select({ id: watchlists.id })
        .from(watchlists)
        .where(eq(watchlists.id, DEFAULT_WATCHLIST_ID))
        .for("update");
      let added = 0;
      const unique = new Map(names.map((name) => [normalizeMarketHashName(name), name]));
      const existing = await tx
        .select({ normalized: items.normalizedMarketHashName })
        .from(watchlistItems)
        .innerJoin(items, eq(watchlistItems.itemId, items.id))
        .where(eq(watchlistItems.watchlistId, DEFAULT_WATCHLIST_ID));
      const known = new Set(existing.map((entry) => entry.normalized));
      if (
        existing.length + [...unique.keys()].filter((name) => !known.has(name)).length >
        WATCHLIST_ITEM_LIMIT
      ) {
        throw new BadRequestException(
          `Watchlist can contain at most ${WATCHLIST_ITEM_LIMIT} items; no items were added`
        );
      }
      for (const [normalized, name] of [...unique].sort(([left], [right]) =>
        left.localeCompare(right)
      )) {
        const item = await this.findOrCreateItem(name, normalized, tx);
        const inserted = await tx
          .insert(watchlistItems)
          .values({ watchlistId: DEFAULT_WATCHLIST_ID, itemId: item.id })
          .onConflictDoNothing()
          .returning({ id: watchlistItems.id });
        added += inserted.length;
      }
      const [count] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, DEFAULT_WATCHLIST_ID));
      return { added, skipped: names.length - added, total: count?.total ?? 0 };
    });
  }

  async ensureProvider(id: string, displayName = id): Promise<void> {
    await this.db
      .insert(marketProviders)
      .values({
        id,
        displayName
      })
      .onConflictDoNothing();
  }

  async reserveSyncRun(input: SyncRunInput): Promise<SyncReservation> {
    await this.ensureProvider(CS2CAP_PROVIDER_ID, "CS2Cap");
    return this.db.transaction(async (tx) => {
      // Serialize quota checks and reservations across API instances and worker jobs.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('csst:cs2cap:budget'))`);
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const [usage] = await tx
        .select({ used: sql<number>`coalesce(sum(${syncRuns.requestCost}), 0)::int` })
        .from(syncRuns)
        .where(
          and(eq(syncRuns.providerId, CS2CAP_PROVIDER_ID), gte(syncRuns.startedAt, monthStart))
        );
      if ((usage?.used ?? 0) >= input.monthlyLimit) {
        return { status: "skipped", reason: "CS2Cap monthly request budget is exhausted" };
      }
      const [recent] = await tx
        .select({ id: syncRuns.id })
        .from(syncRuns)
        .where(
          and(
            eq(syncRuns.providerId, CS2CAP_PROVIDER_ID),
            eq(syncRuns.itemId, input.itemId),
            gte(syncRuns.startedAt, new Date(now.getTime() - input.cooldownSeconds * 1000))
          )
        )
        .limit(1);
      if (recent !== undefined) {
        return {
          status: "skipped",
          reason: "Item refresh cooldown is active; cached prices retained"
        };
      }
      const [syncRun] = await tx
        .insert(syncRuns)
        .values({
          providerId: CS2CAP_PROVIDER_ID,
          itemId: input.itemId,
          marketHashName: input.marketHashName,
          status: "started",
          startedAt: now,
          requestedItemCount: 1,
          requestCost: 1
        })
        .returning({ id: syncRuns.id });
      if (syncRun === undefined) throw new Error("Unable to reserve sync run");
      return { status: "reserved", id: syncRun.id };
    });
  }

  async finishSyncRun(input: FinishSyncRunInput): Promise<void> {
    await this.db
      .update(syncRuns)
      .set({
        status: input.status,
        snapshotsCreated: input.snapshotsCreated,
        responseStatus: input.responseStatus ?? null,
        rateLimitLimit: input.rateLimitLimit ?? null,
        rateLimitRemaining: input.rateLimitRemaining ?? null,
        rateLimitResetAt: input.rateLimitResetAt ?? null,
        errorMessage: input.errorMessage ?? null,
        finishedAt: new Date()
      })
      .where(eq(syncRuns.id, input.id));
  }

  async createSnapshots(snapshots: SnapshotInput[]): Promise<number> {
    if (snapshots.length === 0) {
      return 0;
    }

    for (const snapshot of snapshots) {
      await this.ensureProvider(snapshot.providerId);
    }

    const inserted = await this.db
      .insert(priceSnapshots)
      .values(
        snapshots.map((snapshot) => ({
          itemId: snapshot.itemId,
          providerId: snapshot.providerId,
          lowestAsk: formatNullableMoney(snapshot.lowestAsk),
          highestBid: formatNullableMoney(snapshot.highestBid),
          askVolume: snapshot.askVolume,
          bidVolume: snapshot.bidVolume,
          currency: snapshot.currency,
          rawPayload: snapshot.rawPayload,
          sourceUpdatedAt: snapshot.sourceUpdatedAt,
          collectedAt: snapshot.collectedAt
        }))
      )
      .returning({ id: priceSnapshots.id });

    return inserted.length;
  }

  async getMonthlyRequestUsage(referenceDate = new Date()): Promise<number> {
    const monthStart = new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1)
    );

    const [usage] = await this.db
      .select({
        used: sql<number>`coalesce(sum(${syncRuns.requestCost}), 0)::int`
      })
      .from(syncRuns)
      .where(and(eq(syncRuns.providerId, CS2CAP_PROVIDER_ID), gte(syncRuns.startedAt, monthStart)));

    return usage?.used ?? 0;
  }

  private async ensureDefaultWatchlist(): Promise<void> {
    await this.db
      .insert(watchlists)
      .values({
        id: DEFAULT_WATCHLIST_ID,
        name: DEFAULT_WATCHLIST_NAME
      })
      .onConflictDoNothing();
  }

  private async findOrCreateItem(
    marketHashName: string,
    normalizedMarketHashName: string,
    db: Pick<Database, "select" | "insert"> = this.db
  ) {
    const [existing] = await db
      .select()
      .from(items)
      .where(eq(items.normalizedMarketHashName, normalizedMarketHashName))
      .limit(1);

    if (existing !== undefined) {
      return existing;
    }

    const [created] = await db
      .insert(items)
      .values({
        marketHashName,
        normalizedMarketHashName
      })
      .onConflictDoNothing()
      .returning();

    if (created !== undefined) return created;
    const [concurrent] = await db
      .select()
      .from(items)
      .where(eq(items.normalizedMarketHashName, normalizedMarketHashName))
      .limit(1);
    if (concurrent === undefined) throw new Error("Unable to create item");
    return concurrent;
  }

  private async getLatestSnapshots(itemIds: string[]): Promise<Map<string, PriceSnapshot[]>> {
    if (itemIds.length === 0) {
      return new Map();
    }

    const rows = await this.db
      .selectDistinctOn([priceSnapshots.itemId, priceSnapshots.providerId], {
        id: priceSnapshots.id,
        itemId: priceSnapshots.itemId,
        provider: priceSnapshots.providerId,
        lowestAsk: priceSnapshots.lowestAsk,
        highestBid: priceSnapshots.highestBid,
        askVolume: priceSnapshots.askVolume,
        bidVolume: priceSnapshots.bidVolume,
        currency: priceSnapshots.currency,
        sourceUpdatedAt: priceSnapshots.sourceUpdatedAt,
        collectedAt: priceSnapshots.collectedAt
      })
      .from(priceSnapshots)
      .where(inArray(priceSnapshots.itemId, itemIds))
      .orderBy(
        priceSnapshots.itemId,
        priceSnapshots.providerId,
        desc(priceSnapshots.collectedAt),
        desc(priceSnapshots.id)
      );

    const snapshotsByItem = new Map<string, PriceSnapshot[]>();
    for (const row of rows) {
      const existing = snapshotsByItem.get(row.itemId) ?? [];
      const freshness = getSnapshotFreshness(row.collectedAt, row.sourceUpdatedAt);
      existing.push({
        id: row.id,
        itemId: row.itemId,
        provider: row.provider,
        lowestAsk: parseNullableNumber(row.lowestAsk),
        highestBid: parseNullableNumber(row.highestBid),
        askVolume: row.askVolume,
        bidVolume: row.bidVolume,
        currency: "USD",
        sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
        collectedAt: row.collectedAt.toISOString(),
        freshness,
        isStale: freshness === "stale"
      });
      snapshotsByItem.set(row.itemId, existing);
    }

    return snapshotsByItem;
  }

  private async getSnapshotsForItem(itemId: string): Promise<PriceSnapshot[]> {
    const rows = await this.db
      .select({
        id: priceSnapshots.id,
        itemId: priceSnapshots.itemId,
        provider: priceSnapshots.providerId,
        lowestAsk: priceSnapshots.lowestAsk,
        highestBid: priceSnapshots.highestBid,
        askVolume: priceSnapshots.askVolume,
        bidVolume: priceSnapshots.bidVolume,
        currency: priceSnapshots.currency,
        sourceUpdatedAt: priceSnapshots.sourceUpdatedAt,
        collectedAt: priceSnapshots.collectedAt
      })
      .from(priceSnapshots)
      .where(eq(priceSnapshots.itemId, itemId))
      .orderBy(asc(priceSnapshots.collectedAt));

    return rows.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      provider: row.provider,
      lowestAsk: parseNullableNumber(row.lowestAsk),
      highestBid: parseNullableNumber(row.highestBid),
      askVolume: row.askVolume,
      bidVolume: row.bidVolume,
      currency: "USD",
      sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
      collectedAt: row.collectedAt.toISOString(),
      freshness: getSnapshotFreshness(row.collectedAt, row.sourceUpdatedAt),
      isStale: getSnapshotFreshness(row.collectedAt, row.sourceUpdatedAt) === "stale"
    }));
  }
}

export function normalizeMarketHashName(marketHashName: string): string {
  return marketHashName.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatNullableMoney(value: number | null): string | null {
  return value === null ? null : value.toFixed(2);
}
