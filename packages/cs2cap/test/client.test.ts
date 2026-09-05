import { describe, expect, it } from "vitest";

import { parseRateLimitHeaders } from "../src/index.js";

describe("parseRateLimitHeaders", () => {
  it("parses common CS2Cap rate limit headers", () => {
    const headers = new Headers({
      "x-ratelimit-limit": "1000",
      "x-ratelimit-remaining": "998",
      "x-ratelimit-reset": "1767225600"
    });

    expect(parseRateLimitHeaders(headers)).toEqual({
      limit: 1000,
      remaining: 998,
      resetAt: new Date(1767225600 * 1000)
    });
  });

  it("returns nulls when headers are absent", () => {
    expect(parseRateLimitHeaders(new Headers())).toEqual({
      limit: null,
      remaining: null,
      resetAt: null
    });
  });
});
