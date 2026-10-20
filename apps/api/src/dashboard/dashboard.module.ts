import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardRepository } from "./dashboard.repository.js";

@Module({
  imports: [DbModule],
  controllers: [DashboardController],
  providers: [DashboardRepository]
})
export class DashboardModule {}
