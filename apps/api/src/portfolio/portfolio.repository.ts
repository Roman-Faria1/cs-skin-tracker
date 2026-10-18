import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { items, marketProviders, portfolioItems, priceSnapshots, watchlistItems } from "@csst/db";
import type { Database } from "@csst/db";
import { holdingSchema, portfolioSchema, PORTFOLIO_HOLDING_LIMIT } from "@csst/shared";
import type { HoldingInput, Portfolio, PriceSnapshot } from "@csst/shared";
import { and, asc, desc, eq, getTableColumns, inArray, ne, sql } from "drizzle-orm";
import { DATABASE } from "../db/db.module.js";
import { DEFAULT_WATCHLIST_ID } from "../watchlists/watchlists.repository.js";
import { getSnapshotFreshness } from "../watchlists/watchlists.utils.js";
import { summarizePortfolio, valueHolding } from "./portfolio-valuation.js";

type QueryDb = Pick<Database, "select">;
const selection = {
  ...getTableColumns(portfolioItems),
  marketHashName: items.marketHashName,
  watchId: watchlistItems.id
};

@Injectable()
export class PortfolioRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(providerId: string | null = null): Promise<Portfolio> {
    return this.db.transaction(
      async (tx) => {
        const providers = await tx
          .select({ id: marketProviders.id, name: marketProviders.displayName })
          .from(marketProviders)
          .where(ne(marketProviders.id, "cs2cap"))
          .orderBy(asc(marketProviders.displayName));
        if (providerId !== null && !providers.some((provider) => provider.id === providerId))
          throw new BadRequestException("Unknown market provider");
        const now = new Date();
        const stored = await selectHoldings(tx);
        const ids = [...new Set(stored.map((row) => row.itemId))];
        const rows =
          ids.length === 0
            ? []
            : await tx
                .selectDistinctOn([priceSnapshots.itemId, priceSnapshots.providerId])
                .from(priceSnapshots)
                .where(inArray(priceSnapshots.itemId, ids))
                .orderBy(
                  priceSnapshots.itemId,
                  priceSnapshots.providerId,
                  desc(priceSnapshots.collectedAt),
                  desc(priceSnapshots.id)
                );
        const quotes: PriceSnapshot[] = rows.map((row) => {
          const freshness = getSnapshotFreshness(row.collectedAt, row.sourceUpdatedAt, now);
          return {
            id: row.id,
            itemId: row.itemId,
            provider: row.providerId,
            lowestAsk: row.lowestAsk === null ? null : Number(row.lowestAsk),
            highestBid: row.highestBid === null ? null : Number(row.highestBid),
            askVolume: row.askVolume,
            bidVolume: row.bidVolume,
            currency: "USD",
            sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
            collectedAt: row.collectedAt.toISOString(),
            freshness,
            isStale: freshness === "stale"
          };
        });
        const holdings = stored.map((row) =>
          valueHolding(
            mapHolding(row),
            quotes.filter((quote) => quote.itemId === row.itemId),
            now,
            providerId
          )
        );
        return portfolioSchema.parse({
          asOf: now.toISOString(),
          providerId,
          providers,
          holdings,
          summary: summarizePortfolio(holdings)
        });
      },
      { isolationLevel: "repeatable read", accessMode: "read only" }
    );
  }

  async save(input: HoldingInput, id?: string) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('csst:portfolio'))`);
      const existing =
        id === undefined
          ? undefined
          : (await tx.select().from(portfolioItems).where(eq(portfolioItems.id, id)))[0];
      if (id !== undefined && existing === undefined)
        throw new NotFoundException("Holding not found");
      if (existing === undefined || existing.itemId !== input.itemId) {
        const [watched] = await tx
          .select({ id: watchlistItems.id })
          .from(watchlistItems)
          .where(
            and(
              eq(watchlistItems.watchlistId, DEFAULT_WATCHLIST_ID),
              eq(watchlistItems.itemId, input.itemId)
            )
          )
          .limit(1);
        if (watched === undefined)
          throw new BadRequestException("Add the item to the watchlist before creating a holding");
      }
      const values = {
        itemId: input.itemId,
        quantity: input.quantity.toString(),
        acquisitionPrice:
          input.acquisitionPrice === null ? null : input.acquisitionPrice.toFixed(2),
        notes: input.notes || null,
        updatedAt: new Date()
      };
      let savedId: string | undefined;
      if (id === undefined) {
        const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(portfolioItems);
        if ((count?.count ?? 0) >= PORTFOLIO_HOLDING_LIMIT)
          throw new BadRequestException(
            `At most ${PORTFOLIO_HOLDING_LIMIT} holdings are supported`
          );
        savedId = (
          await tx.insert(portfolioItems).values(values).returning({ id: portfolioItems.id })
        )[0]?.id;
      } else {
        savedId = (
          await tx
            .update(portfolioItems)
            .set(values)
            .where(eq(portfolioItems.id, id))
            .returning({ id: portfolioItems.id })
        )[0]?.id;
      }
      if (savedId === undefined) throw new NotFoundException("Holding not found");
      const [row] = await selectHoldings(tx, savedId);
      if (row === undefined) throw new NotFoundException("Holding not found after save");
      return mapHolding(row);
    });
  }
  async remove(id: string): Promise<{ removed: true }> {
    const [row] = await this.db
      .delete(portfolioItems)
      .where(eq(portfolioItems.id, id))
      .returning({ id: portfolioItems.id });
    if (row === undefined) throw new NotFoundException("Holding not found");
    return { removed: true };
  }
}

function selectHoldings(db: QueryDb, id?: string) {
  return db
    .select(selection)
    .from(portfolioItems)
    .innerJoin(items, eq(portfolioItems.itemId, items.id))
    .leftJoin(
      watchlistItems,
      and(eq(watchlistItems.itemId, items.id), eq(watchlistItems.watchlistId, DEFAULT_WATCHLIST_ID))
    )
    .where(id === undefined ? undefined : eq(portfolioItems.id, id))
    .orderBy(desc(portfolioItems.createdAt), desc(portfolioItems.id));
}
function mapHolding(
  row: typeof portfolioItems.$inferSelect & { marketHashName: string; watchId: string | null }
) {
  return holdingSchema.parse({
    ...row,
    quantity: Number(row.quantity),
    acquisitionPrice: row.acquisitionPrice === null ? null : Number(row.acquisitionPrice),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isWatched: row.watchId !== null
  });
}
