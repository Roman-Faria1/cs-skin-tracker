import { z } from "zod";

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
  itemResults: z.array(refreshWatchlistItemResultSchema).default([])
});

export type Provider = z.infer<typeof providerSchema>;
export type Item = z.infer<typeof itemSchema>;
export type PriceSnapshot = z.infer<typeof priceSnapshotSchema>;
export type Watchlist = z.infer<typeof watchlistSchema>;
export type WatchlistItem = z.infer<typeof watchlistItemSchema>;
export type ItemHistory = z.infer<typeof itemHistorySchema>;
export type AddWatchlistItemRequest = z.infer<typeof addWatchlistItemRequestSchema>;
export type RefreshWatchlistRequest = z.infer<typeof refreshWatchlistRequestSchema>;
export type RefreshWatchlistItemResult = z.infer<typeof refreshWatchlistItemResultSchema>;
export type RefreshWatchlistResponse = z.infer<typeof refreshWatchlistResponseSchema>;
