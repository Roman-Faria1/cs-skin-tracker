import { Module } from "@nestjs/common";

import { Cs2CapModule } from "./cs2cap/cs2cap.module.js";
import { DbModule } from "./db/db.module.js";
import { HealthController } from "./health/health.controller.js";
import { WatchlistsModule } from "./watchlists/watchlists.module.js";

@Module({
  imports: [Cs2CapModule, DbModule, WatchlistsModule],
  controllers: [HealthController]
})
export class AppModule {}
