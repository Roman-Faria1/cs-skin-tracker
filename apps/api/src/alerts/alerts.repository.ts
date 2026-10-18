import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  alertEvents,
  alerts,
  items,
  marketProviders,
  priceSnapshots,
  watchlistItems
} from "@csst/db";
import type { Database } from "@csst/db";
import {
  ALERT_RULE_LIMIT,
  alertEventSchema,
  alertRuleSchema,
  priceSnapshotSchema
} from "@csst/shared";
import type {
  AlertAction,
  AlertEvent,
  AlertEventPage,
  AlertRule,
  AlertRuleInput,
  PriceSnapshot
} from "@csst/shared";
import { and, asc, desc, eq, getTableColumns, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { DATABASE } from "../db/db.module.js";
import { DEFAULT_WATCHLIST_ID } from "../watchlists/watchlists.repository.js";
import { getSnapshotFreshness } from "../watchlists/watchlists.utils.js";
import { evaluateAlert, isFreshQuote } from "./alert-evaluator.js";

const selection = { ...getTableColumns(alerts), marketHashName: items.marketHashName };
const cursorSchema = z.object({ at: z.string().datetime(), id: z.string().uuid() });
type StoredRule = typeof alerts.$inferSelect & { marketHashName: string };
type QueryDb = Pick<Database, "select" | "selectDistinctOn" | "execute">;

@Injectable()
export class AlertsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<AlertRule[]> {
    const rows = await this.db
      .select(selection)
      .from(alerts)
      .innerJoin(items, eq(alerts.itemId, items.id))
      .orderBy(desc(alerts.createdAt), desc(alerts.id));
    return rows.map(mapRule);
  }

  async history(cursor?: string): Promise<AlertEventPage> {
    let before: z.infer<typeof cursorSchema> | undefined;
    if (cursor !== undefined) {
      try {
        before = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
      } catch {
        throw new BadRequestException("Invalid alert history cursor");
      }
    }
    const rows = await this.db
      .select()
      .from(alertEvents)
      .where(
        before === undefined
          ? undefined
          : or(
              lt(alertEvents.triggeredAt, new Date(before.at)),
              and(eq(alertEvents.triggeredAt, new Date(before.at)), lt(alertEvents.id, before.id))
            )
      )
      .orderBy(desc(alertEvents.triggeredAt), desc(alertEvents.id))
      .limit(51);
    const page = rows.slice(0, 50);
    const last = page.at(-1);
    return {
      events: page.map(mapEvent),
      nextCursor:
        rows.length > 50 && last !== undefined
          ? Buffer.from(
              JSON.stringify({ at: last.triggeredAt.toISOString(), id: last.id })
            ).toString("base64url")
          : null
    };
  }

  async save(input: AlertRuleInput, id?: string): Promise<AlertRule> {
    return this.db.transaction(async (tx) => {
      await lockAlerts(tx);
      const now = new Date();
      const [watched] = await tx
        .select({ id: items.id, marketHashName: items.marketHashName })
        .from(watchlistItems)
        .innerJoin(items, eq(watchlistItems.itemId, items.id))
        .where(
          and(
            eq(watchlistItems.watchlistId, DEFAULT_WATCHLIST_ID),
            eq(watchlistItems.itemId, input.itemId)
          )
        )
        .limit(1);
      if (watched === undefined)
        throw new BadRequestException("Alert item must be on the watchlist");
      if (input.providerId !== null) {
        const [provider] = await tx
          .select({ id: marketProviders.id })
          .from(marketProviders)
          .where(eq(marketProviders.id, input.providerId))
          .limit(1);
        if (provider === undefined || provider.id === "cs2cap")
          throw new BadRequestException("Unknown market provider");
      }
      const baseline = await this.baseline(tx, input, now);
      const values = {
        itemId: input.itemId,
        kind: input.kind,
        threshold: input.threshold.toFixed(2),
        providerId: input.providerId,
        status: "active" as const,
        armedAt: now,
        triggeredAt: null,
        baselineSnapshot: baseline,
        lastEvaluatedAt: null,
        lastEvaluation: null
      };
      let row: typeof alerts.$inferSelect | undefined;
      if (id === undefined) {
        const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(alerts);
        if ((count?.count ?? 0) >= ALERT_RULE_LIMIT)
          throw new BadRequestException(`At most ${ALERT_RULE_LIMIT} alert rules are supported`);
        [row] = await tx.insert(alerts).values(values).returning();
      } else {
        [row] = await tx
          .update(alerts)
          .set({ ...values, generation: sql`${alerts.generation} + 1` })
          .where(eq(alerts.id, id))
          .returning();
      }
      if (row === undefined) throw new NotFoundException("Alert rule not found");
      return mapRule({ ...row, marketHashName: watched.marketHashName });
    });
  }

  async action(id: string, action: AlertAction): Promise<AlertRule> {
    return this.db.transaction(async (tx) => {
      await lockAlerts(tx);
      const [row] = await tx
        .select(selection)
        .from(alerts)
        .innerJoin(items, eq(alerts.itemId, items.id))
        .where(eq(alerts.id, id));
      if (row === undefined) throw new NotFoundException("Alert rule not found");
      const allowed = action === "pause" ? "active" : action === "resume" ? "paused" : "triggered";
      if (row.status !== allowed)
        throw new BadRequestException(`Cannot ${action} a ${row.status} rule`);
      const now = new Date();
      let baseline = row.baselineSnapshot;
      if (action === "rearm") {
        const [watched] = await tx
          .select({ id: watchlistItems.id })
          .from(watchlistItems)
          .where(
            and(
              eq(watchlistItems.watchlistId, DEFAULT_WATCHLIST_ID),
              eq(watchlistItems.itemId, row.itemId)
            )
          )
          .limit(1);
        if (watched === undefined)
          throw new BadRequestException("Add the item back to the watchlist before rearming");
        if (row.threshold === null)
          throw new BadRequestException("Edit this rule to set a threshold");
        baseline = await this.baseline(
          tx,
          {
            itemId: row.itemId,
            kind: row.kind,
            providerId: row.providerId,
            threshold: Number(row.threshold)
          },
          now
        );
      }
      const [updated] = await tx
        .update(alerts)
        .set(
          action === "rearm"
            ? {
                status: "active",
                armedAt: now,
                generation: row.generation + 1,
                baselineSnapshot: baseline,
                triggeredAt: null,
                lastEvaluatedAt: null,
                lastEvaluation: null
              }
            : { status: action === "pause" ? "paused" : "active" }
        )
        .where(eq(alerts.id, id))
        .returning();
      if (updated === undefined) throw new NotFoundException("Alert rule not found");
      return mapRule({ ...updated, marketHashName: row.marketHashName });
    });
  }

  async remove(id: string): Promise<{ removed: true }> {
    return this.db.transaction(async (tx) => {
      await lockAlerts(tx);
      const [row] = await tx.delete(alerts).where(eq(alerts.id, id)).returning({ id: alerts.id });
      if (row === undefined) throw new NotFoundException("Alert rule not found");
      return { removed: true };
    });
  }

  async evaluate(): Promise<{ evaluated: number; triggered: number }> {
    return this.db.transaction(async (tx) => {
      await lockAlerts(tx);
      const now = new Date();
      const rows = await tx
        .select(selection)
        .from(alerts)
        .innerJoin(items, eq(alerts.itemId, items.id))
        .where(eq(alerts.status, "active"))
        .orderBy(asc(alerts.id));
      if (rows.length === 0) return { evaluated: 0, triggered: 0 };
      const watchedRows = await tx
        .select({ itemId: watchlistItems.itemId })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, DEFAULT_WATCHLIST_ID));
      const watched = new Set(watchedRows.map((row) => row.itemId));
      const quotes = await this.latest(tx, [...new Set(rows.map((row) => row.itemId))], now);
      let triggered = 0;
      for (const row of rows) {
        const rule = mapRule(row);
        const decision = watched.has(row.itemId)
          ? evaluateAlert(
              rule,
              quotes.filter((quote) => quote.itemId === row.itemId),
              now
            )
          : {
              matches: false,
              observedValue: null,
              message: "Item is no longer watched",
              snapshots: []
            };
        if (decision.matches && rule.threshold !== null && decision.observedValue !== null) {
          await tx.insert(alertEvents).values({
            alertId: row.id,
            itemId: row.itemId,
            marketHashName: row.marketHashName,
            kind: row.kind,
            generation: row.generation,
            threshold: rule.threshold.toFixed(2),
            providerId: row.providerId,
            observedValue: decision.observedValue.toFixed(6),
            message: decision.message,
            evidence: {
              snapshots: decision.snapshots,
              baseline: rule.baselineSnapshot,
              armedAt: rule.armedAt
            },
            triggeredAt: now
          });
          await tx
            .update(alerts)
            .set({
              status: "triggered",
              triggeredAt: now,
              lastEvaluatedAt: now,
              lastEvaluation: decision.message
            })
            .where(eq(alerts.id, row.id));
          triggered += 1;
        } else {
          await tx
            .update(alerts)
            .set({ lastEvaluatedAt: now, lastEvaluation: decision.message })
            .where(eq(alerts.id, row.id));
        }
      }
      return { evaluated: rows.length, triggered };
    });
  }

  private async baseline(
    db: QueryDb,
    input: AlertRuleInput,
    now: Date
  ): Promise<PriceSnapshot | null> {
    if (input.kind !== "percent_change") return null;
    const quote = (await this.latest(db, [input.itemId], now)).find(
      (snapshot) => snapshot.provider === input.providerId
    );
    if (
      quote === undefined ||
      quote.lowestAsk === null ||
      quote.lowestAsk <= 0 ||
      !isFreshQuote(quote, now)
    )
      throw new BadRequestException(
        "Percent change needs a fresh positive price from the selected provider"
      );
    return quote;
  }

  private async latest(db: QueryDb, itemIds: string[], now: Date): Promise<PriceSnapshot[]> {
    if (itemIds.length === 0) return [];
    const rows = await db
      .selectDistinctOn([priceSnapshots.itemId, priceSnapshots.providerId])
      .from(priceSnapshots)
      .where(inArray(priceSnapshots.itemId, itemIds))
      .orderBy(
        priceSnapshots.itemId,
        priceSnapshots.providerId,
        desc(priceSnapshots.collectedAt),
        desc(priceSnapshots.id)
      );
    return rows.map((row) => {
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
  }
}

async function lockAlerts(db: QueryDb): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext('csst:alerts'))`);
}

function mapRule(row: StoredRule): AlertRule {
  return alertRuleSchema.parse({
    ...row,
    threshold: row.threshold === null ? null : Number(row.threshold),
    createdAt: row.createdAt.toISOString(),
    armedAt: row.armedAt.toISOString(),
    triggeredAt: row.triggeredAt?.toISOString() ?? null,
    baselineSnapshot:
      row.baselineSnapshot === null ? null : priceSnapshotSchema.parse(row.baselineSnapshot),
    lastEvaluatedAt: row.lastEvaluatedAt?.toISOString() ?? null
  });
}
function mapEvent(row: typeof alertEvents.$inferSelect): AlertEvent {
  return alertEventSchema.parse({
    ...row,
    threshold: Number(row.threshold),
    observedValue: Number(row.observedValue),
    triggeredAt: row.triggeredAt.toISOString()
  });
}
