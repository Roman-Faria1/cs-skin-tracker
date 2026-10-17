# CS Skin Tracker

Professional-grade personal dashboard for tracking CS2 skin prices, trends, and market data.

## Stack

- TypeScript monorepo with pnpm workspaces
- Next.js frontend
- NestJS + Fastify backend
- Supabase/Postgres via Drizzle
- Redis + BullMQ worker
- CS2Cap as the first market data provider

## Getting Started

1. Use Node 22: `nvm install && nvm use`
2. Install dependencies: `corepack pnpm install`
3. Copy env vars: `cp .env.example .env`
4. Start local infra: `docker compose up -d`
5. Apply checked-in migrations: `corepack pnpm db:migrate`
6. Seed common providers and starter watchlist items: `corepack pnpm db:seed`
7. Start API and web apps: `corepack pnpm dev`

Scheduled collection is opt-in. Set `SYNC_ENABLED=true` and configure the same
`INTERNAL_SYNC_TOKEN` (at least 32 random characters) on the API and worker, then run
`corepack pnpm dev:worker` alongside the API. The worker loads the root `.env`.
Default cadence is once every 24 hours; enabling it can run the first job immediately.
Jobs call the token-protected `/internal/sync` endpoint and use the same Postgres quota
reservations and item cooldowns as manual refreshes. Failed and stalled jobs are not retried.
Stop the worker and set `SYNC_ENABLED=false` to disable collection; unset the API's internal
token to disable the internal route as well. Existing scheduler metadata stays in Redis.

Local Docker Postgres publishes on host port `5433` to avoid colliding with an existing
machine-level Postgres on `5432`.

## CS2Cap Rollout Notes

- Free tier supports live prices and item catalog, so the MVP uses `GET /prices`.
- Batch pricing is a paid-tier optimization and should stay behind an explicit plan/config choice.
- Prices are returned in minor units by CS2Cap and normalized to decimal USD before reaching the UI.
- Keep `CS2CAP_API_KEY` server-side only.

## Development Standards

- Conventional commits are required.
- CS2Cap API keys must only be used by backend or worker code.
- Shared request/response contracts live in `packages/shared`.
- Database schema and migrations live in `packages/db`.
- New behavior should include unit or integration tests appropriate to risk.

## Database Tests

Create a separate `cs_skin_tracker_test` database, then run:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/cs_skin_tracker_test corepack pnpm test
```

Integration tests require a database name ending in `_test` and clear fixture tables there.
They apply checked-in migrations and verify concurrent quota/cooldown enforcement and latest-provider queries.
Without `TEST_DATABASE_URL`, database tests skip. CI provisions a dedicated Postgres database and runs them.
Set `TEST_REDIS_URL=redis://127.0.0.1:6379` to include worker integration tests. These use uniquely named test queues and delete only those queues.
Use `db:generate` only after intentional schema changes, and commit the generated migration and metadata.

## Browser Tests

With Node 22 selected, run `corepack pnpm exec playwright install chromium` once,
then `corepack pnpm build` and `corepack pnpm test:e2e`. The tests start the built frontend
on port 3100, mock all market API responses, and verify watchlist transfers and freshness labels
on desktop and mobile. They make no CS2Cap calls. Screenshots and failure traces go into `test-results`.

## Watchlist Transfer

Use Import Watchlist and Export Watchlist to transfer version 1 JSON files containing
`{ "version": 1, "items": ["AK-47 | Redline (Field-Tested)"] }`.
Watchlists, exports, and imports share a 1000-item capacity. Adds and imports that would
exceed that capacity are rejected atomically; existing items and full backups remain intact.
Imports skip normalized duplicates and do not refresh prices.
Browser imports are limited to 1 MB. An import failure rolls back the entire merge.
