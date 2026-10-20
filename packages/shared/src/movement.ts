import { z } from "zod";
import { marketHashNameSchema, priceSnapshotSchema, providerSchema } from "./schemas.js";

export const MOVEMENT_BASELINE_MAX_AGE_HOURS = 24;
export const movementQuerySchema = z
  .object({
    window: z.enum(["24h", "7d"]).default("24h"),
    providerId: z.string().min(1).max(80).nullable().default(null)
  })
  .strict();
const item = z.object({ itemId: z.string().uuid(), marketHashName: marketHashNameSchema });
export const comparableMovementSchema = item.extend({
  status: z.literal("comparable"),
  providerId: z.string(),
  current: priceSnapshotSchema,
  baseline: priceSnapshotSchema,
  changeUsd: z.string().regex(/^-?(0|[1-9]\d*)\.\d{2}$/),
  changePercent: z.number().finite(),
  direction: z.enum(["up", "down", "flat"])
});
export const movementItemSchema = z.discriminatedUnion("status", [
  comparableMovementSchema,
  item.extend({
    status: z.enum([
      "missing_current",
      "stale_current",
      "unknown_current",
      "invalid_current",
      "missing_baseline",
      "stale_baseline",
      "unknown_baseline",
      "invalid_baseline",
      "zero_baseline",
      "unchanged_source"
    ]),
    providerId: z.string().nullable(),
    current: priceSnapshotSchema.nullable(),
    baseline: priceSnapshotSchema.nullable(),
    changeUsd: z.null(),
    changePercent: z.null(),
    direction: z.null()
  })
]);
export const movementReportSchema = z.object({
  asOf: z.string().datetime(),
  comparisonAt: z.string().datetime(),
  window: z.enum(["24h", "7d"]),
  maxBaselineAgeHours: z.literal(MOVEMENT_BASELINE_MAX_AGE_HOURS),
  providerId: z.string().nullable(),
  providers: z.array(providerSchema),
  summary: z.object({
    watchedItems: z.number().int().nonnegative(),
    comparableItems: z.number().int().nonnegative(),
    up: z.number().int().nonnegative(),
    down: z.number().int().nonnegative(),
    flat: z.number().int().nonnegative(),
    excludedItems: z.number().int().nonnegative()
  }),
  items: z.array(movementItemSchema),
  gainers: z.array(comparableMovementSchema).max(5),
  decliners: z.array(comparableMovementSchema).max(5)
});
export type MovementQuery = z.infer<typeof movementQuerySchema>;
export type MovementWindow = MovementQuery["window"];
export type ComparableMovement = z.infer<typeof comparableMovementSchema>;
export type MovementItem = z.infer<typeof movementItemSchema>;
export type MovementReport = z.infer<typeof movementReportSchema>;
