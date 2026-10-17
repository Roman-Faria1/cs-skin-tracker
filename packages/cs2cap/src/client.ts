import { cs2CapListPricesResponseSchema, cs2CapPricesBatchResponseSchema } from "./types.js";
import type {
  BatchPriceRequest,
  BatchPriceResult,
  Cs2CapClientOptions,
  ListPricesRequest,
  ListPricesResult,
  RateLimitState
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.cs2c.app";

export class Cs2CapError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
    readonly rateLimit: RateLimitState = { limit: null, remaining: null, resetAt: null }
  ) {
    super(message);
    this.name = "Cs2CapError";
  }
}

export class Cs2CapClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: Cs2CapClientOptions) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listPrices(request: ListPricesRequest): Promise<ListPricesResult> {
    const url = new URL(`${this.baseUrl}/v1/prices`);
    url.searchParams.set("market_hash_name", request.marketHashName);
    url.searchParams.set("currency", request.currency ?? "USD");

    for (const provider of request.providers ?? []) {
      url.searchParams.append("providers", provider);
    }

    return this.request(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`
        }
      },
      (json) => cs2CapListPricesResponseSchema.parse(json)
    );
  }

  async getBatchPrices(request: BatchPriceRequest): Promise<BatchPriceResult> {
    return this.request(
      `${this.baseUrl}/v1/prices/batch`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          market_hash_names: request.marketHashNames,
          providers: request.providers,
          currency: request.currency ?? "USD"
        })
      },
      (json) => cs2CapPricesBatchResponseSchema.parse(json)
    );
  }

  private async request<T>(url: string | URL, init: RequestInit, parse: (json: unknown) => T) {
    const response = await this.fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(this.options.requestTimeoutMs ?? 10_000)
    });

    const body = await response.text();
    const rateLimit = parseRateLimitHeaders(response.headers);

    if (!response.ok) {
      throw new Cs2CapError(
        `CS2Cap request failed with status ${response.status}`,
        response.status,
        body,
        rateLimit
      );
    }

    try {
      const json: unknown = JSON.parse(body);
      return { data: parse(json), rateLimit };
    } catch {
      throw new Cs2CapError(
        "CS2Cap returned an invalid price response",
        response.status,
        body,
        rateLimit
      );
    }
  }
}

export function parseRateLimitHeaders(headers: Headers): RateLimitState {
  const limit = parseNullableInteger(headers.get("x-ratelimit-limit"));
  const remaining = parseNullableInteger(headers.get("x-ratelimit-remaining"));
  const resetSeconds = parseNullableInteger(headers.get("x-ratelimit-reset"));

  return {
    limit,
    remaining,
    resetAt: resetSeconds === null ? null : new Date(resetSeconds * 1000)
  };
}

function parseNullableInteger(value: string | null): number | null {
  if (value === null || value.trim() === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}
