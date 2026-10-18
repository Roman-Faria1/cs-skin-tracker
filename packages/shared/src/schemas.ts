import { z } from "zod";

export const WATCHLIST_ITEM_LIMIT = 1000;
export const ALERT_RULE_LIMIT = 1000;

export const marketHashNameSchema = z
  .string()
  .trim()
  .min(3)
  .max(180)
  .describe("Canonical Steam market hash name, including wear when applicable.");

export const providerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1)
});

export const itemSchema = z.object({
  id: z.string().uuid(),
  marketHashName: marketHashNameSchema,
  imageUrl: z.string().url().nullable().optional(),
  createdAt: z.string().datetime()
});

export const priceSnapshotSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  provider: z.string().min(1),
  lowestAsk: z.number().nonnegative().nullable(),
  highestBid: z.number().nonnegative().nullable(),
  askVolume: z.number().int().nonnegative().nullable(),
  bidVolume: z.number().int().nonnegative().nullable(),
  currency: z.literal("USD"),
  sourceUpdatedAt: z.string().datetime().nullable(),
  collectedAt: z.string().datetime(),
  freshness: z.enum(["fresh", "stale", "unknown"]).default("unknown"),
  isStale: z.boolean()
});

export const watchlistItemSchema = z.object({
  id: z.string().uuid(),
  item: itemSchema,
  latestSnapshots: z.array(priceSnapshotSchema)
});

export const watchlistSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  items: z.array(watchlistItemSchema)
});

export const itemHistorySchema = z.object({
  item: itemSchema,
  snapshots: z.array(priceSnapshotSchema)
});

export const addWatchlistItemRequestSchema = z.object({
  marketHashName: marketHashNameSchema
});

export const watchlistTransferSchema = z
  .object({
    version: z.literal(1),
    items: z.array(marketHashNameSchema).max(WATCHLIST_ITEM_LIMIT)
  })
  .strict();

export const watchlistImportSchema = watchlistTransferSchema;

export const importWatchlistResponseSchema = z.object({
  added: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  total: z.number().int().nonnegative()
});

export const refreshWatchlistRequestSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(100).optional()
});

export const refreshWatchlistItemResultSchema = z.object({
  itemId: z.string().uuid(),
  marketHashName: marketHashNameSchema,
  status: z.enum(["succeeded", "failed", "skipped"]),
  snapshotsCreated: z.number().int().nonnegative(),
  errorMessage: z.string().nullable().optional()
});

export const refreshWatchlistResponseSchema = z.object({
  requestedItems: z.number().int().nonnegative(),
  snapshotsCreated: z.number().int().nonnegative(),
  remainingMonthlyBudget: z.number().int().nonnegative().nullable(),
  failedItems: z.number().int().nonnegative().default(0),
  itemResults: z.array(refreshWatchlistItemResultSchema).default([]),
  alertEvaluation: z
    .object({ triggered: z.number().int().nonnegative(), error: z.string().nullable() })
    .optional()
});

export const alertKindSchema = z.enum([
  "price_below",
  "percent_change",
  "provider_spread",
  "stale_data"
]);
export const alertStatusSchema = z.enum(["active", "paused", "triggered"]);
export const alertRuleInputSchema = z
  .object({
    itemId: z.string().uuid(),
    kind: alertKindSchema,
    threshold: z.number().finite().positive().max(9999999999.99).multipleOf(0.01),
    providerId: z.string().min(1).max(80).nullable().default(null)
  })
  .strict()
  .superRefine((rule, context) => {
    if (rule.kind === "percent_change" && rule.providerId === null)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["providerId"],
        message: "Percent change requires a specific provider"
      });
    if (rule.kind === "provider_spread" && rule.providerId !== null)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["providerId"],
        message: "Provider spread compares all fresh providers"
      });
    if (rule.kind === "stale_data" && (!Number.isInteger(rule.threshold) || rule.threshold > 8760))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["threshold"],
        message: "Data age must be a whole number of hours from 1 to 8760"
      });
  });
export const alertActionSchema = z
  .object({ action: z.enum(["pause", "resume", "rearm"]) })
  .strict();
export const alertRuleSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  marketHashName: marketHashNameSchema,
  kind: alertKindSchema,
  status: alertStatusSchema,
  threshold: z.number().positive().nullable(),
  providerId: z.string().nullable(),
  generation: z.number().int().positive(),
  createdAt: z.string().datetime(),
  armedAt: z.string().datetime(),
  triggeredAt: z.string().datetime().nullable(),
  baselineSnapshot: priceSnapshotSchema.nullable(),
  lastEvaluatedAt: z.string().datetime().nullable(),
  lastEvaluation: z.string().nullable()
});
export const alertEventSchema = z.object({
  id: z.string().uuid(),
  alertId: z.string().uuid().nullable(),
  itemId: z.string().uuid().nullable(),
  marketHashName: marketHashNameSchema,
  kind: alertKindSchema,
  generation: z.number().int().positive(),
  threshold: z.number().positive(),
  providerId: z.string().nullable(),
  observedValue: z.number().finite(),
  message: z.string(),
  triggeredAt: z.string().datetime(),
  evidence: z.object({
    snapshots: z.array(priceSnapshotSchema),
    baseline: priceSnapshotSchema.nullable(),
    armedAt: z.string().datetime()
  })
});
export const alertEventPageSchema = z.object({
  events: z.array(alertEventSchema),
  nextCursor: z.string().nullable()
});
export const alertEvaluationResponseSchema = z.object({
  evaluated: z.number().int().nonnegative(),
  triggered: z.number().int().nonnegative()
});

export type AlertKind = z.infer<typeof alertKindSchema>;
export type AlertRuleInput = z.infer<typeof alertRuleInputSchema>;
export type AlertRule = z.infer<typeof alertRuleSchema>;
export type AlertAction = z.infer<typeof alertActionSchema>["action"];
export type AlertEvent = z.infer<typeof alertEventSchema>;
export type AlertEventPage = z.infer<typeof alertEventPageSchema>;

export type Provider = z.infer<typeof providerSchema>;
export type Item = z.infer<typeof itemSchema>;
export type PriceSnapshot = z.infer<typeof priceSnapshotSchema>;
export type Watchlist = z.infer<typeof watchlistSchema>;
export type WatchlistItem = z.infer<typeof watchlistItemSchema>;
export type ItemHistory = z.infer<typeof itemHistorySchema>;
export type AddWatchlistItemRequest = z.infer<typeof addWatchlistItemRequestSchema>;
export type WatchlistTransfer = z.infer<typeof watchlistTransferSchema>;
export type ImportWatchlistResponse = z.infer<typeof importWatchlistResponseSchema>;
export type RefreshWatchlistRequest = z.infer<typeof refreshWatchlistRequestSchema>;
export type RefreshWatchlistItemResult = z.infer<typeof refreshWatchlistItemResultSchema>;
export type RefreshWatchlistResponse = z.infer<typeof refreshWatchlistResponseSchema>;
