import { Controller, Get } from "@nestjs/common";
import { OwnerAuthExempt } from "../auth/auth.guard.js";

@Controller("health")
export class HealthController {
  @OwnerAuthExempt()
  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "cs-skin-tracker-api",
      checkedAt: new Date().toISOString()
    };
  }
}
