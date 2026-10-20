import { BadRequestException, Controller, Get, Inject, Query } from "@nestjs/common";
import { movementQuerySchema } from "@csst/shared";
import { DashboardRepository } from "./dashboard.repository.js";

@Controller("dashboard")
export class DashboardController {
  constructor(@Inject(DashboardRepository) private readonly dashboard: DashboardRepository) {}
  @Get("movement") movement(@Query() query: unknown) {
    const parsed = movementQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException("Expected window=24h or 7d and an optional market provider");
    return this.dashboard.movement(parsed.data);
  }
}
