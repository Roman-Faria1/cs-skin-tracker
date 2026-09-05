import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  items,
  marketProviders,
  priceSnapshots,
  syncRuns,
  watchlistItems,
  watchlists
} from "@csst/db";
import type { Database } from "@csst/db";
import type { PriceSnapshot, Watchlist, WatchlistItem } from "@csst/shared";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { DATABASE } from "../db/db.module.js";
import { parseNullableNumber } from "./watchlists.utils.js";

const DEFAULT_WATCHLIST_ID = "00000000-0000-4000-8000-000000000001";
const DEFAULT_WATCHLIST_NAME = "Default";
const CS2CAP_PROVIDER_ID = "cs2cap";
const SNAPSHOTS_PER_ITEM = 10;

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
  requestedItemCount: number;
  requestCost: number;
}

export interface FinishSyncRunInput {
  id: string;
  status: "succeeded" | "failed";
  snapshotsCreated: number;
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

  async addItem(marketHashName: string): Promise<WatchlistItem> {
    await this.ensureDefaultWatchlist();

    const normalizedMarketHashName = normalizeMarketHashName(marketHashName);
    const item = await this.findOrCreateItem(marketHashName, normalizedMarketHashName);

    const [watchlistItem] = await this.db
      .insert(watchlistItems)
      .values({
        watchlistId: DEFAULT_WATCHLIST_ID,
        itemId: item.id
      })
      .onConflictDoNothing()
      .returning();

    if (watchlistItem !== undefined) {
      return {
        id: watchlistItem.id,
        item: {
          id: item.id,
          marketHashName: item.marketHashName,
          imageUrl: item.imageUrl,
          createdAt: item.createdAt.toISOString()
        },
        latestSnapshots: []
      };
    }

    const existing = await this.getWatchlistEntries([item.id]);
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

  async ensureProvider(id: string, displayName = id): Promise<void> {
    await this.db
      .insert(marketProviders)
      .values({
        id,
        displayName
      })
      .onConflictDoNothing();
  }

  async createSyncRun(input: SyncRunInput): Promise<string> {
    await this.ensureProvider(CS2CAP_PROVIDER_ID, "CS2Cap");

    const [syncRun] = await this.db
      .insert(syncRuns)
      .values({
        providerId: CS2CAP_PROVIDER_ID,
        status: "started",
        requestedItemCount: input.requestedItemCount,
        requestCost: input.requestCost
      })
      .returning({ id: syncRuns.id });

    if (syncRun === undefined) {
      throw new Error("Unable to create sync run");
    }

    return syncRun.id;
  }

  async finishSyncRun(input: FinishSyncRunInput): Promise<void> {
    await this.db
      .update(syncRuns)
      .set({
        status: input.status,
        snapshotsCreated: input.snapshotsCreated,
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
      .where(gte(syncRuns.startedAt, monthStart));

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

  private async findOrCreateItem(marketHashName: string, normalizedMarketHashName: string) {
    const [existing] = await this.db
      .select()
      .from(items)
      .where(eq(items.normalizedMarketHashName, normalizedMarketHashName))
      .limit(1);

    if (existing !== undefined) {
      return existing;
    }

    const [created] = await this.db
      .insert(items)
      .values({
        marketHashName,
        normalizedMarketHashName
      })
      .returning();

    if (created === undefined) {
      throw new Error("Unable to create item");
    }

    return created;
  }

  private async getLatestSnapshots(itemIds: string[]): Promise<Map<string, PriceSnapshot[]>> {
    if (itemIds.length === 0) {
      return new Map();
    }

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
      .where(inArray(priceSnapshots.itemId, itemIds))
      .orderBy(desc(priceSnapshots.collectedAt))
      .limit(Math.max(100, itemIds.length * SNAPSHOTS_PER_ITEM * 2));

    const snapshotsByItem = new Map<string, PriceSnapshot[]>();
    for (const row of rows) {
      const existing = snapshotsByItem.get(row.itemId) ?? [];
      if (existing.length >= SNAPSHOTS_PER_ITEM) {
        continue;
      }

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
        isStale: isStale(row.collectedAt)
      });
      snapshotsByItem.set(row.itemId, existing);
    }

    return snapshotsByItem;
  }
}

export function normalizeMarketHashName(marketHashName: string): string {
  return marketHashName.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatNullableMoney(value: number | null): string | null {
  return value === null ? null : value.toFixed(2);
}

function isStale(collectedAt: Date): boolean {
  const staleAfterMs = 1000 * 60 * 60 * 24;
  return Date.now() - collectedAt.getTime() > staleAfterMs;
}
