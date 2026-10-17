import { z } from "zod";

const schema = z
  .object({
    REDIS_URL: z.string().url().default("redis://localhost:6379"),
    API_BASE_URL: z.string().url().default("http://localhost:4000"),
    INTERNAL_SYNC_TOKEN: z.string().default(""),
    SYNC_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    SYNC_INTERVAL_HOURS: z.coerce.number().int().min(12).max(168).default(24),
    SYNC_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(180000)
  })
  .superRefine((env, context) => {
    if (env.SYNC_ENABLED && env.INTERNAL_SYNC_TOKEN.length < 32) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INTERNAL_SYNC_TOKEN"],
        message: "Enabled sync requires a token of at least 32 characters"
      });
    }
  });

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env) {
  return schema.parse(source);
}
export type WorkerEnv = ReturnType<typeof loadWorkerEnv>;
