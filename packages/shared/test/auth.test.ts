import { describe, expect, it } from "vitest";
import { loadAuthConfig } from "../src/auth.js";

const configured = {
  AUTH_ENABLED: "true",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  PRIVATE_OWNER_USER_ID: "00000000-0000-4000-8000-000000000001"
};

describe("private owner auth configuration", () => {
  it("requires explicit auth or an explicit local bypass for production", () => {
    expect(() => loadAuthConfig({ NODE_ENV: "production" })).toThrow("Production requires");
    expect(() => loadAuthConfig({ NODE_ENV: "production", AUTH_ENABLED: "false" })).toThrow();
    expect(loadAuthConfig({ NODE_ENV: "production", ALLOW_LOCAL_AUTH_BYPASS: "true" })).toEqual({
      enabled: false
    });
    expect(loadAuthConfig({ NODE_ENV: "development" })).toEqual({ enabled: false });
  });
  it("does not interpret false-looking strings as true", () => {
    expect(loadAuthConfig({ AUTH_ENABLED: "false" })).toEqual({ enabled: false });
    expect(() => loadAuthConfig({ AUTH_ENABLED: "yes" })).toThrow();
  });
  it("validates the provider and fixed owner rather than granting access to all users", () => {
    expect(loadAuthConfig(configured)).toMatchObject({
      enabled: true,
      ownerId: configured.PRIVATE_OWNER_USER_ID
    });
    for (const key of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "PRIVATE_OWNER_USER_ID"]) {
      expect(() => loadAuthConfig({ ...configured, [key]: "" })).toThrow();
    }
    expect(() =>
      loadAuthConfig({ ...configured, PRIVATE_OWNER_USER_ID: "owner@example.com" })
    ).toThrow();
    expect(() =>
      loadAuthConfig({ ...configured, ALLOW_LOCAL_AUTH_BYPASS: "true", SUPABASE_URL: "" })
    ).toThrow();
    expect(() =>
      loadAuthConfig({ ...configured, SUPABASE_PUBLISHABLE_KEY: "sb_secret_fixture" })
    ).toThrow();
    expect(() =>
      loadAuthConfig({ ...configured, SUPABASE_URL: "http://remote.example" })
    ).toThrow();
  });
});
