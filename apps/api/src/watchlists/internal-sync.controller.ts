import { createHash, timingSafeEqual } from "node:crypto";
import {
  Controller,
  Headers,
  Inject,
  NotFoundException,
  Post,
  UnauthorizedException
} from "@nestjs/common";
import { loadApiEnv } from "../config/env.js";
import { WatchlistsService } from "./watchlists.service.js";

export function authorizeSyncRequest(authorization: string | undefined, token: string): void {
  if (!token) throw new NotFoundException();
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(authorization ?? ""), digest(`Bearer ${token}`))) {
    throw new UnauthorizedException();
  }
}

@Controller("internal")
export class InternalSyncController {
  constructor(@Inject(WatchlistsService) private readonly watchlists: WatchlistsService) {}

  @Post("sync")
  sync(@Headers("authorization") authorization?: string) {
    authorizeSyncRequest(authorization, loadApiEnv().internalSyncToken);
    return this.watchlists.refresh();
  }
}
