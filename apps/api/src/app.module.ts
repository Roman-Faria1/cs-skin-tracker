import { Module } from "@nestjs/common";

import { Cs2CapModule } from "./cs2cap/cs2cap.module.js";
import { DbModule } from "./db/db.module.js";
import { HealthController } from "./health/health.controller.js";
import { WatchlistsModule } from "./watchlists/watchlists.module.js";
import { AlertsModule } from "./alerts/alerts.module.js";
import { PortfolioModule } from "./portfolio/portfolio.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { AuthModule } from "./auth/auth.module.js";

@Module({
  imports: [
    AuthModule,
    Cs2CapModule,
    DbModule,
    WatchlistsModule,
    AlertsModule,
    PortfolioModule,
    DashboardModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
