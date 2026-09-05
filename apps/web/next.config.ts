import type { NextConfig } from "next";

type WebpackConfig = {
  resolve?: {
    extensionAlias?: Record<string, string[]>;
  };
};

const nextConfig: NextConfig = {
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
