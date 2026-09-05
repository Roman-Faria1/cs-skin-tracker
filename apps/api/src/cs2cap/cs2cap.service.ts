import { Injectable } from "@nestjs/common";
import { Cs2CapClient } from "@csst/cs2cap";
import type { BatchPriceResult, ListPricesResult } from "@csst/cs2cap";

import { loadApiEnv } from "../config/env.js";

@Injectable()
export class Cs2CapService {
  private readonly env = loadApiEnv();
  private readonly client = new Cs2CapClient({
    apiKey: this.env.cs2capApiKey,
    baseUrl: this.env.cs2capBaseUrl
  });

  async getBatchPrices(marketHashNames: string[]): Promise<BatchPriceResult> {
    return this.client.getBatchPrices({
      marketHashNames,
      providers: this.env.cs2capDefaultProviders,
      currency: "USD"
    });
  }

  async listPrices(marketHashName: string): Promise<ListPricesResult> {
    return this.client.listPrices({
      marketHashName,
      providers: this.env.cs2capDefaultProviders,
      currency: "USD"
    });
  }

  getMonthlyRequestLimit(): number {
    return this.env.cs2capMonthlyRequestLimit;
  }

  isConfigured(): boolean {
    return this.env.cs2capApiKey !== "replace_me";
  }
}
