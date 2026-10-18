import { expect, it } from "vitest";
import { holdingInputSchema } from "../src/index.js";

const input = { itemId: "00000000-0000-4000-8000-000000000201", quantity: 2 };
it("defaults optional cost and notes and retains a known zero cost", () => {
  expect(holdingInputSchema.parse(input)).toEqual({
    ...input,
    acquisitionPrice: null,
    notes: null
  });
  expect(
    holdingInputSchema.parse({ ...input, acquisitionPrice: 0, notes: " test " })
  ).toMatchObject({ acquisitionPrice: 0, notes: "test" });
});
it.each([
  { quantity: 0 },
  { quantity: -1 },
  { quantity: 0.5 },
  { quantity: 1000001 },
  { acquisitionPrice: -1 },
  { acquisitionPrice: 0.001 },
  { acquisitionPrice: Infinity },
  { acquisitionPrice: 10000000000 },
  { notes: "a".repeat(2001) },
  { unexpected: true }
])("rejects invalid holding input %j", (changes) => {
  expect(holdingInputSchema.safeParse({ ...input, ...changes }).success).toBe(false);
});
