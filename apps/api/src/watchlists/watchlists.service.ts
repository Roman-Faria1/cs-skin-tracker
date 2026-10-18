import { Injectable, Logger } from "@nestjs/common";
import { Cs2CapError } from "@csst/cs2cap";
import type { RateLimitState } from "@csst/cs2cap";
import type { RefreshWatchlistResponse, WatchlistItem } from "@csst/shared";

import { Cs2CapService } from "../cs2cap/cs2cap.service.js";
import { AlertsService } from "../alerts/alerts.service.js";
import { WatchlistsRepository } from "./watchlists.repository.js";
import type { SnapshotInput } from "./watchlists.repository.js";
import { parseNullableDate, parseNullablePrice } from "./watchlists.utils.js";

@Injectable()
export class WatchlistsService {
  private readonly logger = new Logger(WatchlistsService.name);

  constructor(
    private readonly cs2cap: Cs2CapService,
    private readonly repository: WatchlistsRepository,
    private readonly alerts: AlertsService
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

  async exportWatchlist() {
    const entries = await this.repository.getWatchlistEntries();
    return { version: 1 as const, items: entries.map((entry) => entry.item.marketHashName) };
  }

  importWatchlist(names: string[]) {
    return this.repository.importItems(names);
  }

  async refresh(itemIds?: string[]): Promise<RefreshWatchlistResponse> {
    const selectedItems = await this.repository.getWatchlistEntries(itemIds);
    const itemResults: RefreshWatchlistResponse["itemResults"] = [];
    let snapshotsCreated = 0;
    let stoppedReason = this.cs2cap.isConfigured() ? null : "CS2Cap API key is not configured";

    for (const entry of selectedItems) {
      const identity = { itemId: entry.item.id, marketHashName: entry.item.marketHashName };
      if (stoppedReason !== null) {
        itemResults.push({
          ...identity,
          status: "skipped",
          snapshotsCreated: 0,
          errorMessage: stoppedReason
        });
        continue;
      }

      let syncRunId: string;
      try {
        const reservation = await this.repository.reserveSyncRun({
          ...identity,
          monthlyLimit: this.cs2cap.getMonthlyRequestLimit(),
          cooldownSeconds: this.cs2cap.getRefreshCooldownSeconds()
        });
        if (reservation.status === "skipped") {
          itemResults.push({
            ...identity,
            status: "skipped",
            snapshotsCreated: 0,
            errorMessage: reservation.reason
          });
          continue;
        }
        syncRunId = reservation.id;
      } catch {
        this.logger.error({ message: "Unable to reserve sync run", itemId: identity.itemId });
        itemResults.push({
          ...identity,
          status: "failed",
          snapshotsCreated: 0,
          errorMessage: "Unable to reserve refresh; no provider request was sent"
        });
        continue;
      }

      let itemSnapshotsCreated = 0;
      let responseStatus: number | null = null;
      let rateLimit: RateLimitState = { limit: null, remaining: null, resetAt: null };
      let errorMessage: string | null = null;
      try {
        const result = await this.cs2cap.listPrices(identity.marketHashName);
        responseStatus = 200;
        rateLimit = result.rateLimit;
        const collectedAt = new Date();
        const snapshots = result.data.items.map<SnapshotInput>((price) => ({
          itemId: identity.itemId,
          providerId: price.provider ?? "unknown",
          lowestAsk: parseNullablePrice(price.lowest_ask, price.lowest_ask_decimal),
          highestBid: parseNullablePrice(price.highest_bid, price.highest_bid_decimal),
          askVolume: price.quantity ?? null,
          bidVolume: price.bid_volume ?? null,
          currency: "USD",
          rawPayload: price,
          sourceUpdatedAt: parseNullableDate(price.last_updated ?? price.timestamp),
          collectedAt
        }));
        itemSnapshotsCreated = await this.repository.createSnapshots(snapshots);
        snapshotsCreated += itemSnapshotsCreated;
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : "Unknown refresh error";
        if (error instanceof Cs2CapError) {
          responseStatus = error.status;
          rateLimit = error.rateLimit;
          if ([401, 403, 429].includes(error.status)) {
            stoppedReason = `Refresh stopped after CS2Cap status ${error.status}; cached prices retained`;
          }
        }
      }

      if (rateLimit.remaining === 0) {
        stoppedReason = "CS2Cap rate limit exhausted; cached prices retained";
      }
      try {
        await this.repository.finishSyncRun({
          id: syncRunId,
          status: errorMessage === null ? "succeeded" : "failed",
          snapshotsCreated: itemSnapshotsCreated,
          responseStatus,
          rateLimitLimit: rateLimit.limit,
          rateLimitRemaining: rateLimit.remaining,
          rateLimitResetAt: rateLimit.resetAt,
          errorMessage
        });
      } catch {
        this.logger.error({ message: "Unable to finalize sync run", syncRunId });
        errorMessage =
          errorMessage === null
            ? "Prices saved, but sync log could not be finalized"
            : `${errorMessage}; sync log could not be finalized`;
      }
      itemResults.push({
        ...identity,
        status: errorMessage === null ? "succeeded" : "failed",
        snapshotsCreated: itemSnapshotsCreated,
        errorMessage
      });
    }

    let alertEvaluation: RefreshWatchlistResponse["alertEvaluation"];
    try {
      const result = await this.alerts.evaluate();
      alertEvaluation = { triggered: result.triggered, error: null };
    } catch {
      this.logger.error("Alert evaluation failed; cached prices retained");
      alertEvaluation = {
        triggered: 0,
        error: "Alert evaluation failed; try checking alerts again"
      };
    }

    return {
      requestedItems: selectedItems.length,
      alertEvaluation,
      snapshotsCreated,
      remainingMonthlyBudget: Math.max(
        this.cs2cap.getMonthlyRequestLimit() - (await this.repository.getMonthlyRequestUsage()),
        0
      ),
      failedItems: itemResults.filter((result) => result.status === "failed").length,
      itemResults
    };
  }
}
