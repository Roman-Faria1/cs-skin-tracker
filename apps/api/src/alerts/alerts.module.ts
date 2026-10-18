import { Module } from "@nestjs/common";
import { DbModule } from "../db/db.module.js";
import { AlertsController } from "./alerts.controller.js";
import { AlertsRepository } from "./alerts.repository.js";
import { AlertsService } from "./alerts.service.js";

@Module({
  imports: [DbModule],
  controllers: [AlertsController],
  providers: [AlertsRepository, AlertsService],
  exports: [AlertsService]
})
export class AlertsModule {}
