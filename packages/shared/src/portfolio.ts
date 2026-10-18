import { z } from "zod";
import { priceSnapshotSchema, providerSchema } from "./schemas.js";

export const PORTFOLIO_HOLDING_LIMIT = 1000;
export const HOLDING_QUANTITY_LIMIT = 1000000;

export const holdingInputSchema = z
  .object({
    itemId: z.string().uuid(),
    quantity: z.number().int().positive().max(HOLDING_QUANTITY_LIMIT),
    acquisitionPrice: z
      .number()
      .finite()
      .nonnegative()
      .max(9999999999.99)
      .multipleOf(0.01)
      .nullable()
      .default(null),
    notes: z.string().trim().max(2000).nullable().default(null)
  })
  .strict();

export const holdingSchema = z.object({
  id: z.string().uuid(),
  itemId: z.string().uuid(),
  marketHashName: z.string(),
  quantity: z.number().int().positive(),
  acquisitionPrice: z.number().nonnegative().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  isWatched: z.boolean()
});
const usdSchema = z.string().regex(/^(0|[1-9]\d*)\.\d{2}$/);
const signedUsdSchema = z.string().regex(/^-?(0|[1-9]\d*)\.\d{2}$/);
export const valuedHoldingSchema = holdingSchema.extend({
  valuationStatus: z.enum(["fresh", "stale", "unknown", "missing", "invalid_time"]),
  quote: priceSnapshotSchema.nullable(),
  unitPrice: usdSchema.nullable(),
  costBasis: usdSchema.nullable(),
  marketValue: usdSchema.nullable(),
  unrealizedPnl: signedUsdSchema.nullable()
});
export const portfolioSchema = z.object({
  asOf: z.string().datetime(),
  providerId: z.string().nullable(),
  providers: z.array(providerSchema),
  holdings: z.array(valuedHoldingSchema),
  summary: z.object({
    holdingCount: z.number().int().nonnegative(),
    totalQuantity: z.number().int().nonnegative(),
    valuedHoldings: z.number().int().nonnegative(),
    unvaluedHoldings: z.number().int().nonnegative(),
    unknownCostHoldings: z.number().int().nonnegative(),
    pnlHoldings: z.number().int().nonnegative(),
    valuationStatus: z.enum(["complete", "partial", "unavailable"]),
    grossAskValue: usdSchema.nullable(),
    knownCostBasis: usdSchema,
    pricedCostBasis: usdSchema.nullable(),
    unrealizedPnl: signedUsdSchema.nullable()
  })
});
export type HoldingInput = z.infer<typeof holdingInputSchema>;
export type Holding = z.infer<typeof holdingSchema>;
export type ValuedHolding = z.infer<typeof valuedHoldingSchema>;
export type Portfolio = z.infer<typeof portfolioSchema>;
