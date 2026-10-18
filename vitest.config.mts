import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Repository suites reset the same dedicated integration database.
    fileParallelism: false
  }
});
