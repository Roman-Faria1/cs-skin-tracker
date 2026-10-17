import { describe, expect, it } from "vitest";

import { Cs2CapClient, Cs2CapError, parseRateLimitHeaders } from "../src/index.js";

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

describe("Cs2CapClient", () => {
  it("preserves HTTP status and rate-limit headers on failure", async () => {
    const client = new Cs2CapClient({
      apiKey: "test",
      fetchImpl: () =>
        Promise.resolve(
          new Response("blocked", { status: 429, headers: { "x-ratelimit-remaining": "0" } })
        )
    });
    await expect(client.listPrices({ marketHashName: "AK-47 | Redline" })).rejects.toMatchObject({
      status: 429,
      rateLimit: { remaining: 0 }
    });
  });

  it("preserves HTTP metadata when successful HTTP responses contain invalid JSON", async () => {
    const client = new Cs2CapClient({
      apiKey: "test",
      fetchImpl: () =>
        Promise.resolve(new Response("invalid", { headers: { "x-ratelimit-remaining": "25" } }))
    });
    await expect(client.listPrices({ marketHashName: "AK-47 | Redline" })).rejects.toBeInstanceOf(
      Cs2CapError
    );
    await expect(client.listPrices({ marketHashName: "AK-47 | Redline" })).rejects.toMatchObject({
      status: 200,
      rateLimit: { remaining: 25 }
    });
  });

  it("aborts a stalled request without retrying", async () => {
    let calls = 0;
    const client = new Cs2CapClient({
      apiKey: "test",
      requestTimeoutMs: 20,
      fetchImpl: async (_url, init) => {
        calls += 1;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Request timed out", "TimeoutError")),
            {
              once: true
            }
          );
        });
      }
    });
    await expect(client.listPrices({ marketHashName: "AK-47 | Redline" })).rejects.toMatchObject({
      name: "TimeoutError"
    });
    expect(calls).toBe(1);
  });

  it.each([200, 401, 403, 429])(
    "preserves HTTP %i metadata when the response body disconnects",
    async (status) => {
      const client = new Cs2CapClient({
        apiKey: "test",
        fetchImpl: () =>
          Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.error(new Error("Disconnected"));
                }
              }),
              {
                status,
                headers: {
                  "x-ratelimit-limit": "1000",
                  "x-ratelimit-remaining": "0",
                  "x-ratelimit-reset": "1793491200"
                }
              }
            )
          )
      });
      await expect(client.listPrices({ marketHashName: "AK-47 | Redline" })).rejects.toMatchObject({
        name: "Cs2CapError",
        status,
        rateLimit: { limit: 1000, remaining: 0, resetAt: new Date(1793491200 * 1000) }
      });
    }
  );

  it("preserves received status and rate limits when the body stalls until timeout", async () => {
    let calls = 0;
    const client = new Cs2CapClient({
      apiKey: "test",
      requestTimeoutMs: 20,
      fetchImpl: (_url, init) => {
        calls += 1;
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                init?.signal?.addEventListener(
                  "abort",
                  () => controller.error(new DOMException("Body timed out", "TimeoutError")),
                  { once: true }
                );
              }
            }),
            { status: 429, headers: { "x-ratelimit-remaining": "0" } }
          )
        );
      }
    });
    await expect(client.listPrices({ marketHashName: "AK-47 | Redline" })).rejects.toMatchObject({
      name: "Cs2CapError",
      status: 429,
      rateLimit: { remaining: 0 }
    });
    expect(calls).toBe(1);
  });
});
