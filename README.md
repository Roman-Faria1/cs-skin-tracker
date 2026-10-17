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

1. Use Node 20: `nvm use`
2. Install dependencies: `corepack pnpm install`
3. Copy env vars: `cp .env.example .env`
4. Start local infra: `docker compose up -d`
5. Apply checked-in migrations: `corepack pnpm db:migrate`
6. Seed common providers and starter watchlist items: `corepack pnpm db:seed`
7. Start API and web apps: `corepack pnpm dev`

The worker is scaffolded for later scheduled sync work and can be started separately with
`corepack pnpm dev:worker` once Redis-backed jobs are wired into persistence.

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
Use `db:generate` only after intentional schema changes, and commit the generated migration and metadata.
