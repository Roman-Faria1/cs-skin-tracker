import { z } from "zod";

const enabledAuthSchema = z.object({
  SUPABASE_URL: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      );
    }, "Supabase requires HTTPS except on loopback"),
  SUPABASE_PUBLISHABLE_KEY: z.string().startsWith("sb_publishable_"),
  PRIVATE_OWNER_USER_ID: z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase())
});

export function loadAuthConfig(env: Record<string, string | undefined>) {
  const enabled = z.enum(["true", "false"]).default("false").parse(env.AUTH_ENABLED) === "true";
  if (!enabled) {
    if (env.NODE_ENV === "production") throw new Error("Production requires AUTH_ENABLED=true");
    return { enabled: false as const };
  }
  const parsed = enabledAuthSchema.parse(env);
  return {
    enabled: true as const,
    supabaseUrl: parsed.SUPABASE_URL,
    publishableKey: parsed.SUPABASE_PUBLISHABLE_KEY,
    ownerId: parsed.PRIVATE_OWNER_USER_ID
  };
}

export type AuthConfig = ReturnType<typeof loadAuthConfig>;

export const authFetch: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(10000);
  return fetch(input, {
    ...init,
    cache: "no-store",
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
  });
};
