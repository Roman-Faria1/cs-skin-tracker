# CS Skin Tracker Handoff

## Current State

- Repo: `https://github.com/Roman-Faria1/cs-skin-tracker.git`
- Current branch: `fix/v0-2-refresh-safety`
- Latest merged main commit: `92d62ad` (PR #2, sync observability).
- Main stack: TypeScript, pnpm workspaces, Next.js, NestJS/Fastify, Drizzle, Postgres, Redis/BullMQ.
- Data provider: CS2Cap free-tier live prices via `GET https://api.cs2c.app/v1/prices`.
- v0.1 is effectively complete for personal MVP usage.
- v0.2 now includes stale-data labels, provider comparison UI, and manual refresh observability.
- Current work: refresh safety, snapshot correctness, DB integration coverage, then scheduled collection and watchlist transfer.
- Refresh safety now uses a Postgres advisory transaction lock to reserve quota and enforce per-item cooldown across processes. Network calls happen after the transaction commits.
- Reservations remain charged if a process crashes or a request times out; this conservatively protects quota. Started rows are never automatically retried.
- CS2Cap requests default to a 10-second timeout; per-item cooldown defaults to 3600 seconds. Configure with `CS2CAP_REQUEST_TIMEOUT_MS` and `CS2CAP_REFRESH_COOLDOWN_SECONDS`.
- Authentication/rate-limit responses stop the current refresh; sync-log finalization failures preserve saved snapshots and do not abort remaining items.
- Completed `f94f0f3 fix: enforce atomic refresh budgets and cooldowns`.
- Snapshot correctness slice: Postgres selects one latest row per item/provider with a deterministic tie-break; source freshness is `fresh`, `stale`, or `unknown` (24-hour threshold). UI comparisons exclude stale/unknown quotes. Migration `0002_snapshot_and_sync_indexes.sql` adds query indexes.
- Snapshot correctness committed as `6ca7a9a`.
- Integration tests use only `TEST_DATABASE_URL` (database name must end in `_test`). They delete fixture rows in that dedicated database. Without that variable they skip; CI provisions it and runs migrations twice, concurrent quota/cooldown tests, and uneven snapshot-history queries. Never point it at the app database.
- DB integration/CI coverage committed as `044b643`.
- Worker now uses a BullMQ Job Scheduler and the API's protected `POST /internal/sync` route. Default `SYNC_ENABLED=false`; API/worker need matching `INTERNAL_SYNC_TOKEN` (32+ characters). Default cadence 24 hours, minimum 12. Enabling may trigger an immediate first sync. No job retries or stalled-job recovery; expired catch-up jobs skip. Stop all workers to disable execution; Redis retains scheduler metadata.
- Worker tests use mocked API responses; `TEST_REDIS_URL` enables a real Redis queue/scheduler test. The full suite passed 42 tests with Postgres and Redis enabled. No CS2Cap calls are required.
- Scheduled collection committed as `dd8e4c2`.
- Watchlist transfer implemented: `GET /watchlists/default/export` and `POST /watchlists/default/import`, version 1 JSON `{ "version": 1, "items": ["market hash name"] }`. Up to 1000 names, browser file limit 1 MB. Imports merge atomically, normalize duplicates, preserve existing canonical names, and never request prices. UI has import/download controls.

Recent commits:

```txt
6549ede Merge pull request #1 from Roman-Faria1/feat/v0-2-data-quality
56fba2c fix: select newest provider snapshots
5796be8 fix: address watchlist review feedback
a8fbd55 docs: add project handoff notes
998f660 feat: add data quality comparison UI
9609b3c fix: align cs2cap live price integration
```

## Local Setup

Use Node 22 (also used by CI):

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
- Manual refresh returns per-item results with `succeeded`, `failed`, or `skipped` status.
- Each attempted CS2Cap item refresh creates a `sync_runs` row with target item/name, request cost, response status, rate-limit headers when available, snapshots created, and error message when failed.
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
- October 17, 2026: 32 tests passed, including 3 Postgres integration tests in the isolated `cs_skin_tracker_test` database. No provider requests were made.
- Build passed. Next emits a warning that the Next ESLint plugin is not detected in the flat ESLint config; this is known and non-blocking.

Docker validation already completed locally:

```txt
Postgres: healthy on 127.0.0.1:5433
Redis: healthy on 127.0.0.1:6379
Seeded rows: 12 items, 6 providers, 12 watched items
```

## Next Recommended Work

1. Refresh safety committed; concurrent quota/cooldown behavior verified against Postgres.
2. Snapshot correctness committed; uneven refresh histories verified against Postgres.
3. Isolated Postgres integration tests and CI migration/build validation implemented and locally verified.
4. Scheduled sync and endpoint authorization implemented, disabled by default; Redis integration verified.
5. Watchlist import/export implemented; finish full verification, local smoke check, and final review.

Keep this section updated at each completed slice. No real CS2Cap requests should be needed for automated tests.

## Gotchas

- Do not expose `CS2CAP_API_KEY` to the frontend.
- Avoid using CS2Cap batch endpoints while on the free tier; batch is treated as a paid-tier optimization.
- The repo uses conventional commits and has a pre-commit typecheck hook.
- Git operations that write `.git` may need elevated permission in this environment.
- Docker CLI may need Docker Desktop's bundled path if `docker` is not on `PATH`:

```bash
PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" docker compose ps
```
