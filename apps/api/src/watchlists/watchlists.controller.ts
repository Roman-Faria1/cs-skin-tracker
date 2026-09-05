import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { addWatchlistItemRequestSchema, refreshWatchlistRequestSchema } from "@csst/shared";
import type { AddWatchlistItemRequest, RefreshWatchlistRequest } from "@csst/shared";

import { WatchlistsService } from "./watchlists.service.js";

@Controller("watchlists/default")
export class WatchlistsController {
  constructor(private readonly watchlists: WatchlistsService) {}

  @Get()
  getDefaultWatchlist() {
    return this.watchlists.getDefaultWatchlist();
  }

  @Get("items/:itemId/history")
  getItemHistory(@Param("itemId") itemId: string) {
    return this.watchlists.getItemHistory(itemId);
  }

  @Post("items")
  addItem(@Body() body: AddWatchlistItemRequest) {
    const request = addWatchlistItemRequestSchema.parse(body);
    return this.watchlists.addItem(request.marketHashName);
  }

  @Delete("items/:id")
  removeItem(@Param("id") id: string) {
    return this.watchlists.removeItem(id);
  }

  @Post("refresh")
  refresh(@Body() body: RefreshWatchlistRequest) {
    const request = refreshWatchlistRequestSchema.parse(body ?? {});
    return this.watchlists.refresh(request.itemIds);
  }
}
