import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

import { AppModule } from "./app.module.js";
import { loadApiEnv } from "./config/env.js";

const env = loadApiEnv();

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true
  });

  app.enableCors({
    origin: env.webOrigin,
    credentials: true
  });

  await app.listen(env.port, "0.0.0.0");
}

void bootstrap();
