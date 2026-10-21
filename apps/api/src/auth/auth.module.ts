import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthService } from "./auth.service.js";
import { OwnerAuthGuard } from "./auth.guard.js";

@Module({ providers: [AuthService, { provide: APP_GUARD, useClass: OwnerAuthGuard }] })
export class AuthModule {}
