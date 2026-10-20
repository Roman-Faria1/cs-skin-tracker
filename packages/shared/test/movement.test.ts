import { expect, it } from "vitest";
import { movementQuerySchema } from "../src/index.js";
it("defaults movement parameters", () => {
  expect(movementQuerySchema.parse({})).toEqual({ window: "24h", providerId: null });
});
it.each([
  { window: "30d" },
  { window: ["24h", "7d"] },
  { providerId: "" },
  { providerId: ["steam"] },
  { unexpected: true }
])("rejects invalid movement query %j", (input) => {
  expect(movementQuerySchema.safeParse(input).success).toBe(false);
});
