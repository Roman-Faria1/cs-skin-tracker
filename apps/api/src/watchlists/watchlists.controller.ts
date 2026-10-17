import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post
} from "@nestjs/common";
import {
  addWatchlistItemRequestSchema,
  refreshWatchlistRequestSchema,
  watchlistImportSchema
} from "@csst/shared";
import type { AddWatchlistItemRequest, RefreshWatchlistRequest } from "@csst/shared";

import { WatchlistsService } from "./watchlists.service.js";

@Controller("watchlists/default")
export class WatchlistsController {
  constructor(@Inject(WatchlistsService) private readonly watchlists: WatchlistsService) {}

  @Get()
  getDefaultWatchlist() {
    return this.watchlists.getDefaultWatchlist();
  }

  @Get("export")
  exportWatchlist() {
    return this.watchlists.exportWatchlist();
  }

  @Post("import")
  importWatchlist(@Body() body: unknown) {
    const parsed = watchlistImportSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        "Invalid watchlist file; expected version 1 and up to 1000 market hash names"
      );
    return this.watchlists.importWatchlist(parsed.data.items);
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
