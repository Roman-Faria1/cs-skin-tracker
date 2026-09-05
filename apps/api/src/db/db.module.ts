import { Module } from "@nestjs/common";
import { createDb } from "@csst/db";

import { loadApiEnv } from "../config/env.js";

export const DATABASE = Symbol("DATABASE");

@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: () => createDb(loadApiEnv().databaseUrl)
    }
  ],
  exports: [DATABASE]
})
export class DbModule {}
