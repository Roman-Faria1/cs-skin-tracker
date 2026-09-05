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
5. Generate/apply migrations: `corepack pnpm db:generate && corepack pnpm db:migrate`
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
