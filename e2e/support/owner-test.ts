import { expect, test as base } from "@playwright/test";

export { expect } from "@playwright/test";

// Feature tests use real application login/session handling with fixture identity only.
export const test = base.extend({
  storageState: async ({ playwright, baseURL }, use) => {
    if (!baseURL) throw new Error("Owner fixture requires a configured baseURL");
    const request = await playwright.request.newContext({ baseURL });
    try {
      const response = await request.post("/auth/sign-in", {
        headers: { origin: new URL(baseURL).origin },
        data: { email: "owner@example.com", password: "fixture-password" }
      });
      expect(response.status()).toBe(200);
      await use(await request.storageState());
    } finally {
      await request.dispose();
    }
  }
});
