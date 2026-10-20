import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { items, marketProviders, priceSnapshots, watchlistItems } from "@csst/db";
import type { Database } from "@csst/db";
import { MOVEMENT_BASELINE_MAX_AGE_HOURS, movementReportSchema } from "@csst/shared";
import type { MovementQuery, MovementReport, PriceSnapshot } from "@csst/shared";
import { and, asc, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { DATABASE } from "../db/db.module.js";
import { DEFAULT_WATCHLIST_ID } from "../watchlists/watchlists.repository.js";
import { getSnapshotFreshness } from "../watchlists/watchlists.utils.js";
import { compareItem, summarizeMovement } from "./movement.js";

@Injectable()
export class DashboardRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async movement(query: MovementQuery): Promise<MovementReport> {
    return this.db.transaction(
      async (tx) => {
        const providers = await tx
          .select({ id: marketProviders.id, name: marketProviders.displayName })
          .from(marketProviders)
          .where(ne(marketProviders.id, "cs2cap"))
          .orderBy(asc(marketProviders.displayName));
        if (
          query.providerId !== null &&
          !providers.some((provider) => provider.id === query.providerId)
        )
          throw new BadRequestException("Unknown market provider");
        const now = new Date();
        const cutoff = new Date(now.getTime() - (query.window === "24h" ? 24 : 7 * 24) * 3600000);
        const earliest = new Date(cutoff.getTime() - MOVEMENT_BASELINE_MAX_AGE_HOURS * 3600000);
        const watched = await tx
          .select({ itemId: items.id, marketHashName: items.marketHashName })
          .from(watchlistItems)
          .innerJoin(items, eq(watchlistItems.itemId, items.id))
          .where(eq(watchlistItems.watchlistId, DEFAULT_WATCHLIST_ID))
          .orderBy(asc(items.marketHashName), asc(items.id));
        const ids = watched.map((item) => item.itemId);
        const scope = and(
          inArray(priceSnapshots.itemId, ids),
          query.providerId === null ? undefined : eq(priceSnapshots.providerId, query.providerId)
        );
        const latest =
          ids.length === 0
            ? []
            : await tx
                .selectDistinctOn([priceSnapshots.itemId, priceSnapshots.providerId])
                .from(priceSnapshots)
                .where(scope)
                .orderBy(
                  priceSnapshots.itemId,
                  priceSnapshots.providerId,
                  desc(priceSnapshots.collectedAt),
                  desc(priceSnapshots.id)
                );
        const historical =
          ids.length === 0
            ? []
            : await tx
                .selectDistinctOn([priceSnapshots.itemId, priceSnapshots.providerId])
                .from(priceSnapshots)
                .where(
                  and(
                    scope,
                    lte(priceSnapshots.collectedAt, cutoff),
                    gte(priceSnapshots.collectedAt, earliest)
                  )
                )
                .orderBy(
                  priceSnapshots.itemId,
                  priceSnapshots.providerId,
                  desc(priceSnapshots.collectedAt),
                  desc(priceSnapshots.id)
                );
        const currentQuotes = latest.map((row) => mapQuote(row, now));
        const baselineQuotes = historical.map((row) => mapQuote(row, cutoff));
        const movements = watched.map((item) =>
          compareItem(item, currentQuotes, baselineQuotes, now, cutoff, query.providerId)
        );
        return movementReportSchema.parse({
          ...query,
          asOf: now.toISOString(),
          comparisonAt: cutoff.toISOString(),
          maxBaselineAgeHours: MOVEMENT_BASELINE_MAX_AGE_HOURS,
          providers,
          items: movements,
          ...summarizeMovement(movements)
        });
      },
      { isolationLevel: "repeatable read", accessMode: "read only" }
    );
  }
}

function mapQuote(row: typeof priceSnapshots.$inferSelect, reference: Date): PriceSnapshot {
  const freshness = getSnapshotFreshness(row.collectedAt, row.sourceUpdatedAt, reference);
  return {
    id: row.id,
    itemId: row.itemId,
    provider: row.providerId,
    lowestAsk: row.lowestAsk === null ? null : Number(row.lowestAsk),
    highestBid: row.highestBid === null ? null : Number(row.highestBid),
    askVolume: row.askVolume,
    bidVolume: row.bidVolume,
    currency: "USD",
    collectedAt: row.collectedAt.toISOString(),
    sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
    freshness,
    isStale: freshness === "stale"
  };
}
