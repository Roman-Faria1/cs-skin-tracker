import { z } from "zod";

const apiEnvSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://postgres:postgres@localhost:5432/cs_skin_tracker"),
  CS2CAP_API_KEY: z.string().min(1).default("replace_me"),
  CS2CAP_BASE_URL: z.string().url().default("https://api.cs2c.app"),
  CS2CAP_MONTHLY_REQUEST_LIMIT: z.coerce.number().int().positive().default(1000),
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
    port: parsed.API_PORT,
    webOrigin: parsed.WEB_ORIGIN,
    databaseUrl: parsed.DATABASE_URL,
    cs2capApiKey: parsed.CS2CAP_API_KEY,
    cs2capBaseUrl: parsed.CS2CAP_BASE_URL,
    cs2capMonthlyRequestLimit: parsed.CS2CAP_MONTHLY_REQUEST_LIMIT,
    cs2capDefaultProviders: parsed.CS2CAP_DEFAULT_PROVIDERS
  };
}
