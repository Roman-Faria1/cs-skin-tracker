# CS Skin Tracker Handoff

## Current State

- Repo: `https://github.com/Roman-Faria1/cs-skin-tracker.git`
- Current branch: `feat/v0-2-data-quality`
- Latest commit: `998f660 feat: add data quality comparison UI`
- Main stack: TypeScript, pnpm workspaces, Next.js, NestJS/Fastify, Drizzle, Postgres, Redis/BullMQ.
- Data provider: CS2Cap free-tier live prices via `GET https://api.cs2c.app/v1/prices`.
- v0.1 is effectively complete for personal MVP usage.
- v0.2 has started with stale-data labels and provider comparison UI.

Recent commits:

```txt
998f660 feat: add data quality comparison UI
9609b3c fix: align cs2cap live price integration
f2f85ec fix: avoid local postgres port conflict
5809b08 feat: add item price history detail view
015fd1e feat: scaffold persisted skin tracker
```

## Local Setup

Use Node 20 if available:

```bash
nvm use
corepack pnpm install
```

Create local env:

```bash
cp .env.example .env
```

Required local env values:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/cs_skin_tracker
REDIS_URL=redis://localhost:6379
CS2CAP_API_KEY=<real key>
CS2CAP_BASE_URL=https://api.cs2c.app
CS2CAP_MONTHLY_REQUEST_LIMIT=1000
CS2CAP_DEFAULT_PROVIDERS=steam,csfloat,skinport,csmoney_m,csmoney_t
```

Local Docker Postgres intentionally uses host port `5433` because this machine also has another Postgres listening on `5432`.

Start and prepare local infra:

```bash
docker compose up -d
corepack pnpm db:migrate
corepack pnpm db:seed
```

Start app:

```bash
corepack pnpm dev:api
corepack pnpm dev:web
```

Local URLs:

```txt
Web: http://localhost:3000
API: http://localhost:4000
Health: http://localhost:4000/health
```

## Architecture Notes

- `apps/web`: Next.js app.
- `apps/api`: NestJS API. Frontend should only call this API, never CS2Cap directly.
- `apps/worker`: BullMQ worker scaffold. Not fully wired into persistence yet.
- `packages/db`: Drizzle schema, migrations, seed script.
- `packages/shared`: Zod schemas and shared API types.
- `packages/cs2cap`: Thin CS2Cap HTTP wrapper.

Important flows:

- Watchlist data is persisted in Postgres.
- `GET /watchlists/default` returns watched items plus latest snapshots.
- `POST /watchlists/default/items` adds by `marketHashName`.
- `DELETE /watchlists/default/items/:id` removes a watchlist row.
- `POST /watchlists/default/refresh` calls CS2Cap and persists price snapshots.
- `GET /watchlists/default/items/:itemId/history` returns chronological snapshots for the detail chart.

CS2Cap live response was validated on September 5, 2026 with:

```txt
AK-47 | Redline (Field-Tested)
providers: csfloat, csmoney_m, csmoney_t, skinport, steam
snapshotsCreated: 5
```

CS2Cap price fields:

- `lowest_ask` is minor units.
- `lowest_ask_decimal` is preferred when present.
- `quantity` maps to ask volume.
- `timestamp` / `last_updated` map to source freshness.

## Verification Commands

Run before committing:

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm format
corepack pnpm test
corepack pnpm build
```

Validated recently:

- Typecheck passed.
- Lint passed.
- Format passed.
- Tests passed: 4 files, 9 tests.
- Build passed. Next emits a warning that the Next ESLint plugin is not detected in the flat ESLint config; this is known and non-blocking.

Docker validation already completed locally:

```txt
Postgres: healthy on 127.0.0.1:5433
Redis: healthy on 127.0.0.1:6379
Seeded rows: 12 items, 6 providers, 12 watched items
```

## Next Recommended Work

Stay on `feat/v0-2-data-quality`.

Recommended next slice:

1. Add stronger sync-run logging around every CS2Cap request.
2. Record partial refresh failures per item instead of failing the whole refresh opaquely.
3. Surface refresh errors in the dashboard without losing stale cached data.
4. Push the feature branch and open a PR when the v0.2 slice is stable.

After that:

- Wire scheduled worker sync for watched items at a conservative cadence.
- Add import/export watchlist.
- Consider one-request-per-item quota implications before adding automatic refresh.

## Gotchas

- Do not expose `CS2CAP_API_KEY` to the frontend.
- Avoid using CS2Cap batch endpoints while on the free tier; batch is treated as a paid-tier optimization.
- The repo uses conventional commits and has a pre-commit typecheck hook.
- Git operations that write `.git` may need elevated permission in this environment.
- Docker CLI may need Docker Desktop's bundled path if `docker` is not on `PATH`:

```bash
PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" docker compose ps
```
