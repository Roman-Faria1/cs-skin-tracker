import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { AlertsController } from "../src/alerts/alerts.controller.js";
import { AlertsService } from "../src/alerts/alerts.service.js";

const id = "00000000-0000-4000-8000-000000000201";
const input = { itemId: id, kind: "price_below", threshold: 10, providerId: null };
const service = {
  list: vi.fn().mockResolvedValue([]),
  history: vi.fn().mockResolvedValue({ events: [], nextCursor: null }),
  save: vi.fn().mockResolvedValue({ id }),
  action: vi.fn().mockResolvedValue({ id }),
  remove: vi.fn().mockResolvedValue({ removed: true }),
  evaluate: vi.fn().mockResolvedValue({ evaluated: 1, triggered: 0 })
};
let app: NestFastifyApplication;
beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(
    {
      module: class TestModule {},
      controllers: [AlertsController],
      providers: [{ provide: AlertsService, useValue: service }]
    },
    new FastifyAdapter(),
    { logger: false }
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
beforeEach(() => vi.clearAllMocks());
afterAll(async () => {
  await app?.close();
});

it("routes CRUD, history, actions and cached evaluation", async () => {
  expect((await app.inject({ method: "GET", url: "/alerts" })).statusCode).toBe(200);
  expect((await app.inject({ method: "POST", url: "/alerts", payload: input })).statusCode).toBe(
    201
  );
  expect(service.save).toHaveBeenCalledWith(input);
  expect(
    (await app.inject({ method: "PUT", url: `/alerts/${id}`, payload: input })).statusCode
  ).toBe(200);
  expect(service.save).toHaveBeenCalledWith(input, id);
  expect(
    (await app.inject({ method: "PATCH", url: `/alerts/${id}`, payload: { action: "pause" } }))
      .statusCode
  ).toBe(200);
  expect(service.action).toHaveBeenCalledWith(id, "pause");
  expect((await app.inject({ method: "DELETE", url: `/alerts/${id}` })).statusCode).toBe(200);
  expect((await app.inject({ method: "GET", url: "/alerts/events?cursor=next" })).statusCode).toBe(
    200
  );
  expect(service.history).toHaveBeenCalledWith("next");
  expect((await app.inject({ method: "POST", url: "/alerts/evaluate" })).json()).toEqual({
    evaluated: 1,
    triggered: 0
  });
});
it("rejects malformed rules and actions before reaching the service", async () => {
  for (const payload of [
    { ...input, threshold: 0 },
    { ...input, kind: "percent_change" },
    { ...input, injected: true }
  ]) {
    expect((await app.inject({ method: "POST", url: "/alerts", payload })).statusCode).toBe(400);
  }
  expect(
    (await app.inject({ method: "PUT", url: "/alerts/not-a-uuid", payload: input })).statusCode
  ).toBe(400);
  expect(
    (await app.inject({ method: "PATCH", url: `/alerts/${id}`, payload: { action: "trigger" } }))
      .statusCode
  ).toBe(400);
  expect(
    (await app.inject({ method: "GET", url: `/alerts/events?cursor=${"a".repeat(501)}` }))
      .statusCode
  ).toBe(400);
  expect(service.save).not.toHaveBeenCalled();
  expect(service.action).not.toHaveBeenCalled();
});
