// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { GET, POST } from "../../../app/api/[...path]/route";
import { readBody } from "./server";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getSession } }) }));
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
beforeEach(() => {
  for (const [key, value] of Object.entries({
    AUTH_ENABLED: "true",
    WEB_ORIGIN: "http://localhost:3000",
    SUPABASE_URL: "https://fixture.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    PRIVATE_OWNER_USER_ID: "00000000-0000-4000-8000-000000000001",
    API_BASE_URL: "http://localhost:4000"
  }))
    vi.stubEnv(key, value);
  getSession.mockResolvedValue({
    data: { session: { access_token: "server-owner-token" } },
    error: null
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("forwards only the server-held bearer and returns noncacheable data", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ holdings: [] }));
  vi.stubGlobal("fetch", fetch);
  const response = await GET(
    new NextRequest("http://localhost:3000/api/portfolio?providerId=steam", {
      headers: { cookie: "session=browser-secret", authorization: "Bearer untrusted-browser-token" }
    }),
    context(["portfolio"])
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const [url, options] = fetch.mock.calls[0] as [URL, RequestInit];
  expect(url.href).toBe("http://localhost:4000/portfolio?providerId=steam");
  const headers = new Headers(options.headers);
  expect(headers.get("authorization")).toBe("Bearer server-owner-token");
  expect(headers.has("cookie")).toBe(false);
  expect(options.redirect).toBe("error");
  expect(options.cache).toBe("no-store");
});

it("requires a session even if middleware is bypassed", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  expect(
    (await GET(new NextRequest("http://localhost:3000/api/portfolio"), context(["portfolio"])))
      .status
  ).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps HEAD read-only and accepts a trailing-slash API base", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null));
  vi.stubGlobal("fetch", fetch);
  vi.stubEnv("API_BASE_URL", "http://localhost:4000/");
  const response = await GET(
    new NextRequest("http://localhost:3000/api/portfolio", { method: "HEAD" }),
    context(["portfolio"])
  );
  expect(response.status).toBe(200);
  const [url, options] = fetch.mock.calls[0] as [URL, RequestInit];
  expect(url.href).toBe("http://localhost:4000/portfolio");
  expect(options.method).toBe("HEAD");
  expect(options.body).toBeUndefined();
});

it("rejects cross-origin writes and internal or unsafe proxy targets", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(
    (
      await POST(
        new NextRequest("http://localhost:3000/api/portfolio", {
          method: "POST",
          headers: { origin: "https://untrusted.example" },
          body: "{}"
        }),
        context(["portfolio"])
      )
    ).status
  ).toBe(403);
  for (const path of [
    ["internal", "sync"],
    ["health"],
    ["portfolio", "..", "internal"],
    ["portfolio", "%2f%2fremote.example"],
    ["portfolio", "a/b"]
  ])
    expect(
      (await GET(new NextRequest("http://localhost:3000/api/portfolio"), context(path))).status
    ).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});

it("bounds streamed request bodies before calling the app API", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const request = new NextRequest("http://localhost:3000/api/portfolio", {
    method: "POST",
    headers: { origin: "http://localhost:3000" },
    body: "x".repeat(1048577)
  });
  expect((await POST(request, context(["portfolio"]))).status).toBe(413);
  expect(fetch).not.toHaveBeenCalled();
  expect(await readBody(new Request("http://localhost", { method: "POST", body: "test" }), 4)).toBe(
    "test"
  );
});

it("returns a safe API failure without leaking credentials or network details", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Private connection information")));
  const response = await GET(
    new NextRequest("http://localhost:3000/api/portfolio"),
    context(["portfolio"])
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ message: "App API unavailable" });
});
