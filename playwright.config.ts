import { defineConfig } from "@playwright/test";

const fixtureAuth = {
  AUTH_ENABLED: "true",
  API_BASE_URL: "http://127.0.0.1:4101/api",
  SUPABASE_URL: "http://127.0.0.1:4101",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  PRIVATE_OWNER_USER_ID: "00000000-0000-4000-8000-000000000001"
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  workers: 2,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      }
    }
  ],
  webServer: [
    {
      command: "corepack pnpm exec tsx e2e/support/auth-server.ts",
      url: "http://127.0.0.1:4101/health",
      reuseExistingServer: false,
      timeout: 60000
    },
    {
      env: {
        ...fixtureAuth,
        WEB_ORIGIN: "http://127.0.0.1:3100"
      },
      command: "corepack pnpm --filter @csst/web exec next start -H 127.0.0.1 -p 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 60000
    },
    {
      command: "corepack pnpm --filter @csst/web exec next start -H 127.0.0.1 -p 3101",
      url: "http://127.0.0.1:3101/login",
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        ...fixtureAuth,
        WEB_ORIGIN: "http://127.0.0.1:3101"
      }
    }
  ]
});
