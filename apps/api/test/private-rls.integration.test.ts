import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createDb, items, type Database } from "@csst/db";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("TEST_DATABASE_URL must end in _test");
const tables = [
  "items",
  "market_providers",
  "watchlists",
  "watchlist_items",
  "price_snapshots",
  "sync_runs",
  "alerts",
  "alert_events",
  "portfolio_items"
];

describe.skipIf(!url)("private API database boundary", () => {
  let db: Database;
  const role = `csst_rls_test_${randomUUID().replaceAll("-", "")}`;
  const itemId = randomUUID();
  beforeAll(async () => {
    db = createDb(url!);
    const migrationsFolder = fileURLToPath(
      new URL("../../../packages/db/drizzle", import.meta.url)
    );
    await migrate(db, { migrationsFolder });
    await migrate(db, { migrationsFolder });
    await db.execute(
      sql`CREATE ROLE ${sql.identifier(role)} NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT`
    );
    await db.execute(sql`GRANT USAGE ON SCHEMA public TO ${sql.identifier(role)}`);
    for (const table of tables)
      await db.execute(
        sql`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${sql.identifier(table)} TO ${sql.identifier(role)}`
      );
    await db.insert(items).values({
      id: itemId,
      marketHashName: "Private RLS Skin",
      normalizedMarketHashName: "private rls skin"
    });
  }, 30000);
  afterAll(async () => {
    if (db) {
      await db.delete(items).where(eq(items.id, itemId));
      await db.execute(sql`DROP OWNED BY ${sql.identifier(role)}`);
      await db.execute(sql`DROP ROLE ${sql.identifier(role)}`);
      await db.$client.end();
    }
  });
  it("enables deny-by-default RLS on every app table", async () => {
    for (const table of tables) {
      const rows = await db.execute(
        sql`SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = ${table}`
      );
      expect(rows[0]?.relrowsecurity).toBe(true);
      const policies = await db.execute(
        sql`SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = ${table}`
      );
      expect(policies).toHaveLength(0);
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE ${sql.identifier(role)}`);
        const visible = await tx.execute(sql`SELECT * FROM ${sql.identifier(table)} LIMIT 1`);
        expect(visible).toHaveLength(0);
      });
    }
  });
  it("blocks client writes even if table grants exist, without blocking server access", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE ${sql.identifier(role)}`);
      expect(
        await tx
          .update(items)
          .set({ imageUrl: "https://untrusted.example/image" })
          .where(eq(items.id, itemId))
          .returning()
      ).toEqual([]);
      expect(await tx.delete(items).where(eq(items.id, itemId)).returning()).toEqual([]);
    });
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE ${sql.identifier(role)}`);
        await tx
          .insert(items)
          .values({ marketHashName: "Denied Skin", normalizedMarketHashName: "denied skin" });
      })
    ).rejects.toMatchObject({ code: "42501" });
    expect(await db.select().from(items).where(eq(items.id, itemId))).toHaveLength(1);
  });
});
