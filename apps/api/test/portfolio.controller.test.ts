import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PortfolioController } from "../src/portfolio/portfolio.controller.js";
import { PortfolioRepository } from "../src/portfolio/portfolio.repository.js";

const id = "00000000-0000-4000-8000-000000000201";
const input = { itemId: id, quantity: 2, acquisitionPrice: null, notes: null };
const repository = {
  list: vi.fn().mockResolvedValue({ holdings: [] }),
  save: vi.fn().mockResolvedValue({ id }),
  remove: vi.fn().mockResolvedValue({ removed: true })
};
let app: NestFastifyApplication;
beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(
    {
      module: class TestModule {},
      controllers: [PortfolioController],
      providers: [{ provide: PortfolioRepository, useValue: repository }]
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
it("routes reads, provider selection and holding mutations", async () => {
  expect((await app.inject({ method: "GET", url: "/portfolio" })).statusCode).toBe(200);
  expect(repository.list).toHaveBeenCalledWith(null);
  expect((await app.inject({ method: "GET", url: "/portfolio?providerId=steam" })).statusCode).toBe(
    200
  );
  expect(repository.list).toHaveBeenCalledWith("steam");
  expect((await app.inject({ method: "POST", url: "/portfolio", payload: input })).statusCode).toBe(
    201
  );
  expect(repository.save).toHaveBeenCalledWith(input);
  expect(
    (await app.inject({ method: "PUT", url: `/portfolio/${id}`, payload: input })).statusCode
  ).toBe(200);
  expect(repository.save).toHaveBeenCalledWith(input, id);
  expect((await app.inject({ method: "DELETE", url: `/portfolio/${id}` })).statusCode).toBe(200);
});
it("rejects invalid quantity, money, identifiers, providers and unexpected fields", async () => {
  for (const payload of [
    { ...input, quantity: 0.5 },
    { ...input, acquisitionPrice: -1 },
    { ...input, unexpected: true }
  ])
    expect((await app.inject({ method: "POST", url: "/portfolio", payload })).statusCode).toBe(400);
  expect(
    (await app.inject({ method: "PUT", url: "/portfolio/not-an-id", payload: input })).statusCode
  ).toBe(400);
  expect((await app.inject({ method: "GET", url: "/portfolio?providerId=" })).statusCode).toBe(400);
  expect(
    (await app.inject({ method: "GET", url: "/portfolio?providerId=steam&providerId=skinport" }))
      .statusCode
  ).toBe(400);
  expect(repository.save).not.toHaveBeenCalled();
  expect(repository.list).not.toHaveBeenCalled();
});
