import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "cs-skin-tracker-api",
      checkedAt: new Date().toISOString()
    };
  }
}
