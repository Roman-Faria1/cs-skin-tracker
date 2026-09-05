import { BadRequestException, Injectable } from "@nestjs/common";
import type { RefreshWatchlistResponse, WatchlistItem } from "@csst/shared";

import { Cs2CapService } from "../cs2cap/cs2cap.service.js";
import { WatchlistsRepository } from "./watchlists.repository.js";
import type { SnapshotInput } from "./watchlists.repository.js";
import { parseNullableDate, parseNullablePrice } from "./watchlists.utils.js";

@Injectable()
export class WatchlistsService {
  constructor(
    private readonly cs2cap: Cs2CapService,
    private readonly repository: WatchlistsRepository
  ) {}

  getDefaultWatchlist() {
    return this.repository.getDefaultWatchlist();
  }

  addItem(marketHashName: string): Promise<WatchlistItem> {
    return this.repository.addItem(marketHashName);
  }

  removeItem(id: string) {
    return this.repository.removeItem(id);
  }

  async refresh(itemIds?: string[]): Promise<RefreshWatchlistResponse> {
    const selectedItems = await this.repository.getWatchlistEntries(itemIds);

    if (selectedItems.length === 0) {
      return {
        requestedItems: 0,
        snapshotsCreated: 0,
        remainingMonthlyBudget: await this.getRemainingBudget()
      };
    }

    if (!this.cs2cap.isConfigured()) {
      return {
        requestedItems: selectedItems.length,
        snapshotsCreated: 0,
        remainingMonthlyBudget: await this.getRemainingBudget()
      };
    }

    const usedRequests = await this.repository.getMonthlyRequestUsage();
    const requestCost = selectedItems.length;
    const remainingMonthlyBudget = this.cs2cap.getMonthlyRequestLimit() - usedRequests;

    if (requestCost > remainingMonthlyBudget) {
      throw new BadRequestException("CS2Cap monthly request budget would be exceeded");
    }

    const syncRunId = await this.repository.createSyncRun({
      requestedItemCount: selectedItems.length,
      requestCost
    });

    let snapshotsCreated = 0;

    try {
      for (const watchlistItem of selectedItems) {
        const result = await this.cs2cap.listPrices(watchlistItem.item.marketHashName);
        const snapshots = result.data.items.map<SnapshotInput>((price) => ({
          itemId: watchlistItem.item.id,
          providerId: price.provider ?? "unknown",
          lowestAsk: parseNullablePrice(price.lowest_ask, price.lowest_ask_decimal),
          highestBid: parseNullablePrice(price.highest_bid, price.highest_bid_decimal),
          askVolume: price.quantity ?? null,
          bidVolume: price.bid_volume ?? null,
          currency: "USD",
          rawPayload: price,
          sourceUpdatedAt: parseNullableDate(price.last_updated ?? price.timestamp),
          collectedAt: new Date()
        }));

        snapshotsCreated += await this.repository.createSnapshots(snapshots);

        await this.repository.finishSyncRun({
          id: syncRunId,
          status: "succeeded",
          snapshotsCreated,
          rateLimitLimit: result.rateLimit.limit,
          rateLimitRemaining: result.rateLimit.remaining,
          rateLimitResetAt: result.rateLimit.resetAt
        });
      }

      return {
        requestedItems: selectedItems.length,
        snapshotsCreated,
        remainingMonthlyBudget: Math.max(remainingMonthlyBudget - requestCost, 0)
      };
    } catch (error) {
      await this.repository.finishSyncRun({
        id: syncRunId,
        status: "failed",
        snapshotsCreated,
        errorMessage: error instanceof Error ? error.message : "Unknown refresh error"
      });

      throw error;
    }
  }

  private async getRemainingBudget(): Promise<number> {
    const usedRequests = await this.repository.getMonthlyRequestUsage();
    return Math.max(this.cs2cap.getMonthlyRequestLimit() - usedRequests, 0);
  }
}
