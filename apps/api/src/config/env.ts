import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { z } from "zod";
import { loadAuthConfig } from "@csst/shared";

loadDotEnv();

const apiEnvSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  INTERNAL_SYNC_TOKEN: z.union([z.literal(""), z.string().min(32)]).default(""),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://postgres:postgres@127.0.0.1:5433/cs_skin_tracker"),
  CS2CAP_API_KEY: z.string().min(1).default("replace_me"),
  CS2CAP_BASE_URL: z.string().url().default("https://api.cs2c.app"),
  CS2CAP_MONTHLY_REQUEST_LIMIT: z.coerce.number().int().positive().default(1000),
  CS2CAP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  CS2CAP_REFRESH_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(3600),
  CS2CAP_DEFAULT_PROVIDERS: z
    .string()
    .default("steam,csfloat,skinport,csmoney_m,csmoney_t")
    .transform((value) =>
      value
        .split(",")
        .map((provider) => provider.trim())
        .filter(Boolean)
    )
});

export function loadApiEnv() {
  const parsed = apiEnvSchema.parse(process.env);

  return {
    auth: loadAuthConfig(process.env),
    port: parsed.API_PORT,
    webOrigin: parsed.WEB_ORIGIN,
    internalSyncToken: parsed.INTERNAL_SYNC_TOKEN,
    databaseUrl: parsed.DATABASE_URL,
    cs2capApiKey: parsed.CS2CAP_API_KEY,
    cs2capBaseUrl: parsed.CS2CAP_BASE_URL,
    cs2capMonthlyRequestLimit: parsed.CS2CAP_MONTHLY_REQUEST_LIMIT,
    cs2capRequestTimeoutMs: parsed.CS2CAP_REQUEST_TIMEOUT_MS,
    cs2capRefreshCooldownSeconds: parsed.CS2CAP_REFRESH_COOLDOWN_SECONDS,
    cs2capDefaultProviders: parsed.CS2CAP_DEFAULT_PROVIDERS
  };
}

function loadDotEnv(): void {
  const envPath = findDotEnv(process.cwd());
  if (envPath === null) {
    return;
  }

  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    process.env[key] ??= value;
  }
}

function findDotEnv(startDirectory: string): string | null {
  let directory = startDirectory;

  while (true) {
    const envPath = join(directory, ".env");
    if (!existsSync(envPath)) {
      const parentDirectory = dirname(directory);
      if (parentDirectory === directory) {
        return null;
      }

      directory = parentDirectory;
      continue;
    }

    return envPath;
  }
}
