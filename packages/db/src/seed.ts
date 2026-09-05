import { eq } from "drizzle-orm";
import { items, marketProviders, watchlistItems, watchlists } from "./schema.js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const DEFAULT_WATCHLIST_ID = "00000000-0000-4000-8000-000000000001";

const providers = [
  { id: "cs2cap", displayName: "CS2Cap" },
  { id: "steam", displayName: "Steam Community Market" },
  { id: "csfloat", displayName: "CSFloat" },
  { id: "skinport", displayName: "Skinport" },
  { id: "csmoney_m", displayName: "CS.MONEY Market" },
  { id: "csmoney_t", displayName: "CS.MONEY Trade" }
];

const seedItems = [
  "AK-47 | Redline (Field-Tested)",
  "AK-47 | The Empress (Field-Tested)",
  "AWP | Asiimov (Field-Tested)",
  "AWP | Dragon Lore (Factory New)",
  "M4A1-S | Printstream (Field-Tested)",
  "M4A4 | Howl (Factory New)",
  "USP-S | Kill Confirmed (Field-Tested)",
  "Desert Eagle | Printstream (Field-Tested)",
  "Glock-18 | Water Elemental (Field-Tested)",
  "Karambit | Doppler (Factory New)",
  "Butterfly Knife | Fade (Factory New)",
  "Sport Gloves | Vice (Field-Tested)"
];

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5433/cs_skin_tracker";

const client = postgres(databaseUrl, { prepare: false });
const db = drizzle(client);

try {
  await db.insert(marketProviders).values(providers).onConflictDoNothing();

  await db
    .insert(watchlists)
    .values({
      id: DEFAULT_WATCHLIST_ID,
      name: "Default"
    })
    .onConflictDoNothing();

  for (const marketHashName of seedItems) {
    const [item] = await db
      .insert(items)
      .values({
        marketHashName,
        normalizedMarketHashName: normalizeMarketHashName(marketHashName)
      })
      .onConflictDoNothing()
      .returning({ id: items.id });

    const itemId =
      item?.id ??
      (
        await db
          .select({ id: items.id })
          .from(items)
          .where(eq(items.normalizedMarketHashName, normalizeMarketHashName(marketHashName)))
          .limit(1)
      )[0]?.id;

    if (itemId === undefined) {
      throw new Error(`Unable to seed item: ${marketHashName}`);
    }

    await db
      .insert(watchlistItems)
      .values({
        watchlistId: DEFAULT_WATCHLIST_ID,
        itemId
      })
      .onConflictDoNothing();
  }

  console.log(`Seeded ${providers.length} providers and ${seedItems.length} watchlist items.`);
} finally {
  await client.end();
}

function normalizeMarketHashName(marketHashName: string): string {
  return marketHashName.trim().replace(/\s+/g, " ").toLowerCase();
}
