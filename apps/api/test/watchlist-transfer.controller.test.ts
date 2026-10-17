import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { WatchlistsController } from "../src/watchlists/watchlists.controller.js";
import { WatchlistsService } from "../src/watchlists/watchlists.service.js";

const data = { version: 1, items: ["AK-47 | Redline (Field-Tested)"] };
const importWatchlist = vi.fn().mockResolvedValue({ added: 1, skipped: 0, total: 1 });
const exportWatchlist = vi.fn().mockResolvedValue(data);
let app: NestFastifyApplication;
beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(
    {
      module: class TestModule {},
      controllers: [WatchlistsController],
      providers: [{ provide: WatchlistsService, useValue: { importWatchlist, exportWatchlist } }]
    },
    new FastifyAdapter(),
    { logger: false }
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(async () => {
  await app?.close();
});
afterEach(() => {
  importWatchlist.mockClear();
});

it("exports versioned names without database identifiers or credentials", async () => {
  const response = await app.inject({ method: "GET", url: "/watchlists/default/export" });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(data);
});
it("validates import requests before sending canonical names to the service", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/watchlists/default/import",
    payload: data
  });
  expect(response.statusCode).toBe(201);
  expect(importWatchlist).toHaveBeenCalledWith(data.items);
});
it.each([
  { version: 2, items: [] },
  { version: 1, items: [""] },
  { version: 1, items: Array.from({ length: 1001 }, () => "AK-47 | Redline") }
])("rejects invalid imports with HTTP 400", async (payload) => {
  const response = await app.inject({ method: "POST", url: "/watchlists/default/import", payload });
  expect(response.statusCode).toBe(400);
  expect(importWatchlist).not.toHaveBeenCalled();
});
