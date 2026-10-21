// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const config = fileURLToPath(new URL("../../../next.config.ts", import.meta.url));
let workspace: string;
beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "csst-web-env-"));
  mkdirSync(join(workspace, "apps/web"), { recursive: true });
  writeFileSync(join(workspace, ".env"), "AUTH_ENABLED=true\nCSST_ENV_PROBE=from-workspace\n");
});
afterEach(() => rmSync(workspace, { recursive: true, force: true }));

function load(overrides: Record<string, string> = {}) {
  // Only fixture configuration enters this subprocess, never the real project's secrets.
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production", TMPDIR: tmpdir() };
  Object.assign(env, overrides);
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      require.resolve("tsx"),
      "-e",
      `const loader = require(${JSON.stringify(require.resolve("@next/env"))});
     loader.loadEnvConfig(process.cwd(), false);
     require(${JSON.stringify(config)});
     console.log(JSON.stringify({enabled: process.env.AUTH_ENABLED, probe: process.env.CSST_ENV_PROBE}));`
    ],
    { cwd: join(workspace, "apps/web"), env, encoding: "utf8" }
  );
  return JSON.parse(output.trim()) as { enabled: string; probe: string };
}

it("loads workspace auth settings after Next has cached the app-directory environment", () => {
  expect(load()).toEqual({ enabled: "true", probe: "from-workspace" });
});

it("preserves host-supplied settings when reloading workspace environment files", () => {
  expect(load({ AUTH_ENABLED: "false", CSST_ENV_PROBE: "from-host" })).toEqual({
    enabled: "false",
    probe: "from-host"
  });
});
