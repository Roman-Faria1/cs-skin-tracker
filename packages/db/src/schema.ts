import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const alertStatusEnum = pgEnum("alert_status", ["active", "paused", "triggered"]);
export const alertKindEnum = pgEnum("alert_kind", [
  "price_below",
  "percent_change",
  "provider_spread",
  "stale_data"
]);
export const syncStatusEnum = pgEnum("sync_status", ["started", "succeeded", "failed"]);

export const items = pgTable(
  "items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    marketHashName: text("market_hash_name").notNull(),
    normalizedMarketHashName: text("normalized_market_hash_name").notNull(),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    marketHashNameIdx: uniqueIndex("items_market_hash_name_idx").on(table.marketHashName),
    normalizedMarketHashNameIdx: uniqueIndex("items_normalized_market_hash_name_idx").on(
      table.normalizedMarketHashName
    )
  })
);

export const marketProviders = pgTable("market_providers", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  supportsListings: boolean("supports_listings").default(true).notNull(),
  supportsBuyOrders: boolean("supports_buy_orders").default(false).notNull(),
  supportsSales: boolean("supports_sales").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const watchlists = pgTable("watchlists", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().default("Default"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    watchlistId: uuid("watchlist_id")
      .notNull()
      .references(() => watchlists.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    watchlistItemIdx: uniqueIndex("watchlist_items_watchlist_item_idx").on(
      table.watchlistId,
      table.itemId
    )
  })
);

export const priceSnapshots = pgTable(
  "price_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    providerId: text("provider_id")
      .notNull()
      .references(() => marketProviders.id),
    lowestAsk: numeric("lowest_ask", { precision: 12, scale: 2 }),
    highestBid: numeric("highest_bid", { precision: 12, scale: 2 }),
    askVolume: integer("ask_volume"),
    bidVolume: integer("bid_volume"),
    currency: text("currency").notNull().default("USD"),
    rawPayload: jsonb("raw_payload")
      .notNull()
      .default(sql`'{}'::jsonb`),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    collectedAt: timestamp("collected_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    latestPriceIdx: index("price_snapshots_latest_idx").on(
      table.itemId,
      table.providerId,
      table.collectedAt.desc(),
      table.id.desc()
    )
  })
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerId: text("provider_id").references(() => marketProviders.id),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    marketHashName: text("market_hash_name"),
    status: syncStatusEnum("status").notNull(),
    requestedItemCount: integer("requested_item_count").default(0).notNull(),
    snapshotsCreated: integer("snapshots_created").default(0).notNull(),
    requestCost: integer("request_cost").default(1).notNull(),
    responseStatus: integer("response_status"),
    rateLimitLimit: integer("rate_limit_limit"),
    rateLimitRemaining: integer("rate_limit_remaining"),
    rateLimitResetAt: timestamp("rate_limit_reset_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true })
  },
  (table) => ({
    budgetIdx: index("sync_runs_budget_idx").on(table.providerId, table.startedAt),
    cooldownIdx: index("sync_runs_cooldown_idx").on(table.providerId, table.itemId, table.startedAt)
  })
);

export const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  kind: alertKindEnum("kind").notNull(),
  status: alertStatusEnum("status").notNull().default("active"),
  threshold: numeric("threshold", { precision: 12, scale: 2 }),
  providerId: text("provider_id").references(() => marketProviders.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }),
  generation: integer("generation").notNull().default(1),
  armedAt: timestamp("armed_at", { withTimezone: true }).notNull().defaultNow(),
  baselineSnapshot: jsonb("baseline_snapshot"),
  lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
  lastEvaluation: text("last_evaluation")
});

export const alertEvents = pgTable(
  "alert_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    alertId: uuid("alert_id").references(() => alerts.id, { onDelete: "set null" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    marketHashName: text("market_hash_name").notNull(),
    kind: alertKindEnum("kind").notNull(),
    generation: integer("generation").notNull(),
    threshold: numeric("threshold", { precision: 12, scale: 2 }).notNull(),
    providerId: text("provider_id"),
    observedValue: numeric("observed_value", { precision: 24, scale: 6 }).notNull(),
    message: text("message").notNull(),
    evidence: jsonb("evidence").notNull(),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    oncePerGeneration: uniqueIndex("alert_events_generation_idx").on(
      table.alertId,
      table.generation
    ),
    historyIdx: index("alert_events_history_idx").on(table.triggeredAt.desc(), table.id.desc())
  })
);

export const portfolioItems = pgTable("portfolio_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull().default("1"),
  acquisitionPrice: numeric("acquisition_price", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const itemsRelations = relations(items, ({ many }) => ({
  watchlistItems: many(watchlistItems),
  priceSnapshots: many(priceSnapshots),
  alerts: many(alerts),
  portfolioItems: many(portfolioItems)
}));

export const watchlistsRelations = relations(watchlists, ({ many }) => ({
  items: many(watchlistItems)
}));

export const watchlistItemsRelations = relations(watchlistItems, ({ one }) => ({
  item: one(items, {
    fields: [watchlistItems.itemId],
    references: [items.id]
  }),
  watchlist: one(watchlists, {
    fields: [watchlistItems.watchlistId],
    references: [watchlists.id]
  })
}));
