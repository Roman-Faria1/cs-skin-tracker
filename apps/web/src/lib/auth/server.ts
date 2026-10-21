import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { authFetch, loadAuthConfig } from "@csst/shared";
import type { NextRequest, NextResponse } from "next/server";

export type CookieChange = { name: string; value: string; options: CookieOptions };

export function webOrigin() {
  const url = new URL(process.env.WEB_ORIGIN ?? "http://localhost:3000");
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    throw new Error("WEB_ORIGIN requires HTTPS except on loopback");
  return url.origin;
}

export function requestAuth(request: NextRequest) {
  const config = loadAuthConfig(process.env);
  const changes: CookieChange[] = [];
  const storageKey = config.enabled
    ? `sb-${new URL(config.supabaseUrl).hostname.split(".")[0]}-auth-token`
    : "csst-local-auth";
  const client = config.enabled
    ? createServerClient(config.supabaseUrl, config.publishableKey, {
        global: { fetch: authFetch },
        cookieOptions: {
          name: storageKey,
          httpOnly: true,
          sameSite: "lax",
          secure: webOrigin().startsWith("https:"),
          path: "/"
        },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookies) => {
            for (const cookie of cookies) {
              request.cookies.set(cookie.name, cookie.value);
              changes.push(cookie);
            }
          }
        }
      })
    : null;
  return {
    config,
    client,
    finish(response: NextResponse) {
      response.headers.set("Cache-Control", "private, no-store");
      for (const cookie of changes) response.cookies.set(cookie.name, cookie.value, cookie.options);
      return response;
    },
    clear() {
      for (const cookie of request.cookies.getAll()) {
        if (
          cookie.name === storageKey ||
          cookie.name.startsWith(`${storageKey}.`) ||
          cookie.name === `${storageKey}-code-verifier`
        )
          changes.push({
            name: cookie.name,
            value: "",
            options: {
              path: "/",
              httpOnly: true,
              sameSite: "lax",
              secure: webOrigin().startsWith("https:"),
              maxAge: 0
            }
          });
      }
    }
  };
}

export function sameOrigin(request: NextRequest) {
  return request.headers.get("origin") === webOrigin();
}

export async function readBody(request: Request, limit = 1048576): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Request body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buffer);
}
