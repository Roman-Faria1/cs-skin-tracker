import { Module } from "@nestjs/common";

import { Cs2CapModule } from "../cs2cap/cs2cap.module.js";
import { DbModule } from "../db/db.module.js";
import { WatchlistsController } from "./watchlists.controller.js";
import { WatchlistsRepository } from "./watchlists.repository.js";
import { WatchlistsService } from "./watchlists.service.js";

@Module({
  imports: [Cs2CapModule, DbModule],
  controllers: [WatchlistsController],
  providers: [WatchlistsRepository, WatchlistsService]
})
export class WatchlistsModule {}
