import { describe, expect, it } from "vitest";

import { addWatchlistItemRequestSchema } from "../src/index.js";

describe("shared schemas", () => {
  it("trims valid market hash names", () => {
    const parsed = addWatchlistItemRequestSchema.parse({
      marketHashName: "  AK-47 | Redline (Field-Tested)  "
    });

    expect(parsed.marketHashName).toBe("AK-47 | Redline (Field-Tested)");
  });

  it("rejects empty market hash names", () => {
    expect(() => addWatchlistItemRequestSchema.parse({ marketHashName: "" })).toThrow();
  });
});
