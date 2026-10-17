import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { InternalSyncController } from "../src/watchlists/internal-sync.controller.js";
import { WatchlistsService } from "../src/watchlists/watchlists.service.js";

const token = "test-token-with-at-least-32-characters";
const refresh = vi.fn().mockResolvedValue({ snapshotsCreated: 0 });
let app: NestFastifyApplication;
beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(
    {
      module: class TestModule {},
      controllers: [InternalSyncController],
      providers: [{ provide: WatchlistsService, useValue: { refresh } }]
    },
    new FastifyAdapter(),
    { logger: false }
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterEach(() => {
  vi.unstubAllEnvs();
  refresh.mockClear();
});
afterAll(async () => {
  await app?.close();
});

it("hides the internal endpoint when no sync token is configured", async () => {
  vi.stubEnv("INTERNAL_SYNC_TOKEN", "");
  expect((await app.inject({ method: "POST", url: "/internal/sync" })).statusCode).toBe(404);
  expect(refresh).not.toHaveBeenCalled();
});
it.each([undefined, "Bearer incorrect"])(
  "rejects missing or incorrect authorization (%s)",
  async (authorization) => {
    vi.stubEnv("INTERNAL_SYNC_TOKEN", token);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/internal/sync",
          headers: authorization ? { authorization } : {}
        })
      ).statusCode
    ).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  }
);
it("calls the shared refresh service for an authorized worker", async () => {
  vi.stubEnv("INTERNAL_SYNC_TOKEN", token);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/internal/sync",
        headers: { authorization: `Bearer ${token}` }
      })
    ).statusCode
  ).toBe(201);
  expect(refresh).toHaveBeenCalledTimes(1);
});
