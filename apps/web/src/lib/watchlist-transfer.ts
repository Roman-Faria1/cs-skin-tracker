import { watchlistImportSchema } from "@csst/shared";

export async function parseWatchlistFile(file: Pick<File, "size" | "text">) {
  if (file.size > 1024 * 1024) throw new Error("Watchlist file must be 1 MB or smaller");
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("Watchlist file must contain valid JSON");
  }
  const parsed = watchlistImportSchema.safeParse(data);
  if (!parsed.success)
    throw new Error("Invalid watchlist file; expected version 1 and up to 1000 market hash names");
  return parsed.data;
}
