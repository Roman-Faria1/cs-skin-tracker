// @vitest-environment node
import { expect, it, vi } from "vitest";
import { parseWatchlistFile } from "./watchlist-transfer";

it("validates and trims imported market hash names", async () => {
  expect(
    await parseWatchlistFile({
      size: 100,
      text: () =>
        Promise.resolve(
          JSON.stringify({ version: 1, items: ["  AK-47 | Redline (Field-Tested)  "] })
        )
    })
  ).toEqual({ version: 1, items: ["AK-47 | Redline (Field-Tested)"] });
});

it.each([
  "not json",
  '{"version":2,"items":[]}',
  '{"version":1,"items":[""]}',
  '{"version":1,"items":[{"name":"AK-47"}]}'
])("rejects invalid watchlist files (%s)", async (text) => {
  await expect(
    parseWatchlistFile({ size: text.length, text: () => Promise.resolve(text) })
  ).rejects.toThrow();
});

it("rejects oversized files before reading their contents", async () => {
  const text = vi.fn();
  await expect(parseWatchlistFile({ size: 1024 * 1024 + 1, text })).rejects.toThrow("1 MB");
  expect(text).not.toHaveBeenCalled();
});
