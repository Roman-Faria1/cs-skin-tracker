import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { resolve } from "node:path";

loadEnvConfig(resolve(process.cwd(), "../.."), process.env.NODE_ENV === "development");

type WebpackConfig = {
  resolve?: {
    extensionAlias?: Record<string, string[]>;
  };
};

const nextConfig: NextConfig = {
  // Preserve the configured auth origin instead of normalizing loopback cookie hosts.
  skipMiddlewareUrlNormalize: true,
  transpilePackages: ["@csst/shared"],
  webpack(config: WebpackConfig) {
    config.resolve ??= {};
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"]
    };

    return config;
  }
};

export default nextConfig;
