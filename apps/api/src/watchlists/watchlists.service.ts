import { BadRequestException, Injectable } from "@nestjs/common";
import { Cs2CapError } from "@csst/cs2cap";
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

  getItemHistory(itemId: string) {
    return this.repository.getItemHistory(itemId);
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
        remainingMonthlyBudget: await this.getRemainingBudget(),
        failedItems: 0,
        itemResults: []
      };
    }

    if (!this.cs2cap.isConfigured()) {
      return {
        requestedItems: selectedItems.length,
        snapshotsCreated: 0,
        remainingMonthlyBudget: await this.getRemainingBudget(),
        failedItems: 0,
        itemResults: selectedItems.map((item) => ({
          itemId: item.item.id,
          marketHashName: item.item.marketHashName,
          status: "skipped",
          snapshotsCreated: 0,
          errorMessage: "CS2Cap API key is not configured"
        }))
      };
    }

    const usedRequests = await this.repository.getMonthlyRequestUsage();
    const requestCost = selectedItems.length;
    const remainingMonthlyBudget = this.cs2cap.getMonthlyRequestLimit() - usedRequests;

    if (requestCost > remainingMonthlyBudget) {
      throw new BadRequestException("CS2Cap monthly request budget would be exceeded");
    }

    let snapshotsCreated = 0;
    let attemptedRequestCost = 0;
    const itemResults: RefreshWatchlistResponse["itemResults"] = [];

    for (const watchlistItem of selectedItems) {
      let syncRunId: string;
      let itemSnapshotsCreated = 0;
      let responseStatus: number | null = null;

      try {
        syncRunId = await this.repository.createSyncRun({
          itemId: watchlistItem.item.id,
          marketHashName: watchlistItem.item.marketHashName,
          requestedItemCount: 1,
          requestCost: 1
        });
        attemptedRequestCost += 1;
      } catch (error) {
        itemResults.push({
          itemId: watchlistItem.item.id,
          marketHashName: watchlistItem.item.marketHashName,
          status: "failed",
          snapshotsCreated: 0,
          errorMessage: getErrorMessage(error)
        });
        continue;
      }

      try {
        const result = await this.cs2cap.listPrices(watchlistItem.item.marketHashName);
        responseStatus = 200;
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

        itemSnapshotsCreated = await this.repository.createSnapshots(snapshots);
        snapshotsCreated += itemSnapshotsCreated;

        await this.repository.finishSyncRun({
          id: syncRunId,
          status: "succeeded",
          snapshotsCreated: itemSnapshotsCreated,
          responseStatus,
          rateLimitLimit: result.rateLimit.limit,
          rateLimitRemaining: result.rateLimit.remaining,
          rateLimitResetAt: result.rateLimit.resetAt
        });

        itemResults.push({
          itemId: watchlistItem.item.id,
          marketHashName: watchlistItem.item.marketHashName,
          status: "succeeded",
          snapshotsCreated: itemSnapshotsCreated
        });
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        await this.repository.finishSyncRun({
          id: syncRunId,
          status: "failed",
          snapshotsCreated: itemSnapshotsCreated,
          responseStatus: getResponseStatus(error, responseStatus),
          errorMessage
        });

        itemResults.push({
          itemId: watchlistItem.item.id,
          marketHashName: watchlistItem.item.marketHashName,
          status: "failed",
          snapshotsCreated: itemSnapshotsCreated,
          errorMessage
        });
      }
    }

    return {
      requestedItems: selectedItems.length,
      snapshotsCreated,
      remainingMonthlyBudget: Math.max(remainingMonthlyBudget - attemptedRequestCost, 0),
      failedItems: itemResults.filter((result) => result.status === "failed").length,
      itemResults
    };
  }

  private async getRemainingBudget(): Promise<number> {
    const usedRequests = await this.repository.getMonthlyRequestUsage();
    return Math.max(this.cs2cap.getMonthlyRequestLimit() - usedRequests, 0);
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown refresh error";
}

function getResponseStatus(error: unknown, fallback: number | null): number | null {
  return error instanceof Cs2CapError ? error.status : fallback;
}
