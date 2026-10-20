import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { DashboardController } from "../src/dashboard/dashboard.controller.js";
import { DashboardRepository } from "../src/dashboard/dashboard.repository.js";
const movement = vi.fn().mockResolvedValue({ items: [] });
let app: NestFastifyApplication;
beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(
    {
      module: class TestModule {},
      controllers: [DashboardController],
      providers: [{ provide: DashboardRepository, useValue: { movement } }]
    },
    new FastifyAdapter(),
    { logger: false }
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
beforeEach(() => movement.mockClear());
afterAll(async () => {
  await app?.close();
});
it("defaults to 24 hours and accepts the seven-day market filter", async () => {
  expect((await app.inject({ method: "GET", url: "/dashboard/movement" })).statusCode).toBe(200);
  expect(movement).toHaveBeenCalledWith({ window: "24h", providerId: null });
  expect(
    (await app.inject({ method: "GET", url: "/dashboard/movement?window=7d&providerId=steam" }))
      .statusCode
  ).toBe(200);
  expect(movement).toHaveBeenCalledWith({ window: "7d", providerId: "steam" });
});
it.each([
  "window=1h",
  "window=24h&window=7d",
  "providerId=",
  "providerId=steam&providerId=skinport",
  "extra=value"
])("rejects invalid query %s", async (query) => {
  expect(
    (await app.inject({ method: "GET", url: `/dashboard/movement?${query}` })).statusCode
  ).toBe(400);
  expect(movement).not.toHaveBeenCalled();
});
