import "reflect-metadata";
import { Controller, Get } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { AuthModule } from "../src/auth/auth.module.js";
import { WatchlistsController } from "../src/watchlists/watchlists.controller.js";
import { WatchlistsService } from "../src/watchlists/watchlists.service.js";
import { InternalSyncController } from "../src/watchlists/internal-sync.controller.js";
import { HealthController } from "../src/health/health.controller.js";
import { PortfolioController } from "../src/portfolio/portfolio.controller.js";
import { PortfolioRepository } from "../src/portfolio/portfolio.repository.js";
import { AlertsController } from "../src/alerts/alerts.controller.js";
import { AlertsService } from "../src/alerts/alerts.service.js";
import { DashboardController } from "../src/dashboard/dashboard.controller.js";
import { DashboardRepository } from "../src/dashboard/dashboard.repository.js";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser } }) }));
const owner = "00000000-0000-4000-8000-000000000001";
const refresh = vi.fn().mockResolvedValue({ requestedItems: 0 });

@Controller("future")
class FutureController {
  @Get() read() {
    return { protected: true };
  }
}

let app: NestFastifyApplication;
beforeAll(async () => {
  for (const [key, value] of Object.entries({
    AUTH_ENABLED: "true",
    SUPABASE_URL: "https://fixture.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    PRIVATE_OWNER_USER_ID: owner,
    INTERNAL_SYNC_TOKEN: "s".repeat(32)
  }))
    vi.stubEnv(key, value);
  app = await NestFactory.create<NestFastifyApplication>(
    {
      module: class TestModule {},
      imports: [AuthModule],
      controllers: [
        FutureController,
        WatchlistsController,
        InternalSyncController,
        HealthController,
        PortfolioController,
        AlertsController,
        DashboardController
      ],
      providers: [
        { provide: WatchlistsService, useValue: { refresh } },
        { provide: PortfolioRepository, useValue: { list: () => [] } },
        { provide: AlertsService, useValue: {} },
        { provide: DashboardRepository, useValue: {} }
      ]
    },
    new FastifyAdapter(),
    { logger: false }
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
beforeEach(() => {
  getUser
    .mockReset()
    .mockResolvedValue({ data: { user: { id: owner, is_anonymous: false } }, error: null });
  refresh.mockClear();
});
afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

it.each([
  ["GET", "/watchlists/default"],
  ["GET", "/watchlists/default/export"],
  ["POST", "/watchlists/default/import"],
  ["POST", "/watchlists/default/items"],
  ["DELETE", `/watchlists/default/items/${owner}`],
  ["GET", `/watchlists/default/items/${owner}/history`],
  ["POST", "/watchlists/default/refresh"],
  ["GET", "/portfolio"],
  ["POST", "/portfolio"],
  ["PUT", `/portfolio/${owner}`],
  ["DELETE", `/portfolio/${owner}`],
  ["GET", "/alerts"],
  ["POST", "/alerts"],
  ["GET", "/alerts/events"],
  ["POST", "/alerts/evaluate"],
  ["PUT", `/alerts/${owner}`],
  ["PATCH", `/alerts/${owner}`],
  ["DELETE", `/alerts/${owner}`],
  ["GET", "/dashboard/movement"],
  ["GET", "/future"]
] as const)("denies unauthenticated %s %s before reading or mutating data", async (method, url) => {
  expect((await app.inject({ method, url })).statusCode).toBe(401);
  expect(getUser).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});

it("verifies a bearer token through Supabase and permits only the owner", async () => {
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/portfolio",
        headers: { authorization: "Bearer owner-token" }
      })
    ).statusCode
  ).toBe(200);
  expect(getUser).toHaveBeenCalledWith("owner-token");
  getUser.mockResolvedValue({ data: { user: { id: "another-user" } }, error: null });
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/portfolio",
        headers: { authorization: "Bearer another-token" }
      })
    ).statusCode
  ).toBe(403);
  getUser.mockResolvedValue({ data: { user: { id: owner, is_anonymous: true } }, error: null });
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/portfolio",
        headers: { authorization: "Bearer anonymous-token" }
      })
    ).statusCode
  ).toBe(403);
});

it("rejects expired/forged tokens and fails closed during provider errors", async () => {
  for (const [status, expected] of [
    [401, 401],
    [429, 503],
    [503, 503]
  ] as const) {
    getUser.mockResolvedValue({ data: { user: null }, error: { status } });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/portfolio",
          headers: { authorization: "Bearer invalid-token" }
        })
      ).statusCode
    ).toBe(expected);
  }
  getUser.mockRejectedValue(new Error("Provider unreachable"));
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/portfolio",
        headers: { authorization: "Bearer any-token" }
      })
    ).statusCode
  ).toBe(503);
});

it("does not accept cookies, query tokens, or malformed authorization headers", async () => {
  for (const authorization of ["Basic owner-token", "Bearer one two", "Bearer "]) {
    expect(
      (await app.inject({ method: "GET", url: "/portfolio", headers: { authorization } }))
        .statusCode
    ).toBe(401);
  }
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/portfolio?access_token=owner-token",
        headers: { cookie: "access_token=owner-token" }
      })
    ).statusCode
  ).toBe(401);
  expect(getUser).not.toHaveBeenCalled();
});

it("keeps health public and the worker route independently token-protected", async () => {
  expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
  expect((await app.inject({ method: "POST", url: "/internal/sync" })).statusCode).toBe(401);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/internal/sync",
        headers: { authorization: "Bearer owner-token" }
      })
    ).statusCode
  ).toBe(401);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/internal/sync",
        headers: { authorization: `Bearer ${"s".repeat(32)}` }
      })
    ).statusCode
  ).toBe(201);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(getUser).not.toHaveBeenCalled();
});
