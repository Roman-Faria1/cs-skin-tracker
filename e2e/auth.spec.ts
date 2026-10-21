import { expect, test } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:3101" });
const origin = "http://127.0.0.1:3101";
const owner = "00000000-0000-4000-8000-000000000001";

test("private routes redirect to login and direct app requests return unauthorized", async ({
  page,
  request
}, testInfo) => {
  for (const path of ["/", "/portfolio", "/alerts", `/items/${owner}`]) {
    await page.goto(path);
    await expect(page).toHaveURL(`${origin}/login`);
    await expect(page.getByRole("heading", { name: "Sign In", exact: true })).toBeVisible();
  }
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect((await request.get("/api/portfolio")).status()).toBe(401);
  expect((await request.post("/api/watchlists/default/refresh", { data: {} })).status()).toBe(401);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.screenshot({ path: testInfo.outputPath("login.png"), fullPage: true });
});

test("owner login uses HTTP-only cookies and server-forwarded credentials; logout clears access", async ({
  page,
  context
}) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.com");
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "Unable to sign in with these credentials"
  );
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`);
  await expect(page.getByRole("region", { name: "Biggest Risers" })).toContainText("+100.00%");
  await expect(page.locator(".overview-metrics")).toContainText("$0.00");
  const authCookies = (await context.cookies()).filter((cookie) => cookie.name.startsWith("sb-"));
  expect(authCookies.length).toBeGreaterThan(0);
  expect(authCookies.every((cookie) => cookie.httpOnly && cookie.sameSite === "Lax")).toBe(true);
  expect(await page.evaluate(() => document.cookie.includes("sb-"))).toBe(false);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  const data = await context.request.get("/api/portfolio");
  expect(data.status()).toBe(200);
  expect(data.headers()["cache-control"]).toContain("no-store");
  const rejected = await context.request.post("/api/watchlists/default/refresh", {
    headers: { origin: "https://untrusted.example" },
    data: {}
  });
  expect(rejected.status()).toBe(403);
  expect((await context.request.get("/api/internal/sync")).status()).toBe(404);
  const crossOriginLogout = await context.request.post("/auth/sign-out", {
    headers: { origin: "https://untrusted.example" }
  });
  expect(crossOriginLogout.status()).toBe(403);
  await context.addCookies([
    { name: "sb-unrelated-auth-token", value: "other-app", url: origin, httpOnly: true }
  ]);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/login`);
  expect(
    (await context.cookies())
      .filter((cookie) => cookie.name.startsWith("sb-"))
      .map((cookie) => cookie.name)
  ).toEqual(["sb-unrelated-auth-token"]);
  expect((await context.request.get("/api/portfolio")).status()).toBe(401);
});

test("a different valid Supabase account cannot enter the private app", async ({
  page,
  context
}) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("other@example.com");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Owner access required");
  await expect(page).toHaveURL(`${origin}/login`);
  expect((await context.cookies()).filter((cookie) => cookie.name.startsWith("sb-"))).toEqual([]);
  expect((await context.request.get("/api/portfolio")).status()).toBe(401);
});

test("login rejects cross-origin requests and oversized input", async ({ request }) => {
  expect(
    (
      await request.post("/auth/sign-in", {
        headers: { origin: "https://untrusted.example" },
        data: { email: "owner@example.com", password: "fixture-password" }
      })
    ).status()
  ).toBe(403);
  expect(
    (
      await request.post("/auth/sign-in", {
        headers: { origin },
        data: { email: "owner@example.com", password: "x".repeat(9000) }
      })
    ).status()
  ).toBe(400);
});

test("expired sessions refresh on the server; forged credentials are not trusted", async ({
  page,
  context
}) => {
  const login = await context.request.post("/auth/sign-in", {
    headers: { origin },
    data: { email: "owner@example.com", password: "fixture-password" }
  });
  expect(login.status()).toBe(200);
  const cookie = (await context.cookies()).find((value) => value.name.endsWith("-auth-token"))!;
  const saved = JSON.parse(
    Buffer.from(cookie.value.slice("base64-".length), "base64url").toString()
  ) as { access_token: string; expires_at: number };
  const expired = { ...saved, expires_at: Math.floor(Date.now() / 1000) - 60 };
  await context.addCookies([
    { ...cookie, value: `base64-${Buffer.from(JSON.stringify(expired)).toString("base64url")}` }
  ]);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Biggest Risers" })).toContainText("+100.00%");
  const refreshed = (await context.cookies()).find((value) => value.name === cookie.name)!;
  expect(refreshed.value).not.toBe(
    `base64-${Buffer.from(JSON.stringify(expired)).toString("base64url")}`
  );
  const forged = { ...saved, access_token: "forged-owner-token" };
  await context.addCookies([
    { ...cookie, value: `base64-${Buffer.from(JSON.stringify(forged)).toString("base64url")}` }
  ]);
  expect((await context.request.get("/api/portfolio")).status()).toBe(401);
  await page.goto("/");
  await expect(page).toHaveURL(`${origin}/login`);
});
