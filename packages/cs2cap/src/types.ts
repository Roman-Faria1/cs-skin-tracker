import { z } from "zod";

export const cs2CapPriceQuoteSchema = z
  .object({
    item_id: z.union([z.number(), z.string()]).optional(),
    market_hash_name: z.string().optional(),
    phase: z.string().nullable().optional(),
    provider: z.string().optional(),
    lowest_ask: z.union([z.number(), z.string()]).nullable().optional(),
    lowest_ask_decimal: z.string().nullable().optional(),
    highest_bid: z.union([z.number(), z.string()]).nullable().optional(),
    highest_bid_decimal: z.string().nullable().optional(),
    quantity: z.number().int().nullable().optional(),
    bid_volume: z.number().int().nullable().optional(),
    timestamp: z.string().nullable().optional(),
    last_updated: z.string().nullable().optional()
  })
  .passthrough();

export const cs2CapListPricesResponseSchema = z
  .object({
    meta: z.record(z.unknown()).optional(),
    items: z.array(cs2CapPriceQuoteSchema).default([]),
    pagination: z.record(z.unknown()).optional()
  })
  .passthrough();

export const cs2CapBatchPriceItemSchema = z
  .object({
    item_id: z.union([z.number(), z.string()]).optional(),
    market_hash_name: z.string().optional(),
    phase: z.string().nullable().optional(),
    quotes: z.array(cs2CapPriceQuoteSchema).default([])
  })
  .passthrough();

export const cs2CapPricesBatchResponseSchema = z
  .object({
    meta: z.record(z.unknown()).optional(),
    items: z.array(cs2CapBatchPriceItemSchema).default([]),
    items_not_found: z.array(z.unknown()).optional(),
    names_not_found: z.array(z.unknown()).optional()
  })
  .passthrough();

export type Cs2CapPriceQuote = z.infer<typeof cs2CapPriceQuoteSchema>;
export type Cs2CapListPricesResponse = z.infer<typeof cs2CapListPricesResponseSchema>;
export type Cs2CapPricesBatchResponse = z.infer<typeof cs2CapPricesBatchResponseSchema>;

export interface RateLimitState {
  limit: number | null;
  remaining: number | null;
  resetAt: Date | null;
}

export interface Cs2CapClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface BatchPriceRequest {
  marketHashNames: string[];
  providers?: string[];
  currency?: string;
}

export interface BatchPriceResult {
  data: Cs2CapPricesBatchResponse;
  rateLimit: RateLimitState;
}

export interface ListPricesRequest {
  marketHashName: string;
  providers?: string[];
  currency?: string;
}

export interface ListPricesResult {
  data: Cs2CapListPricesResponse;
  rateLimit: RateLimitState;
}
