# CS Skin Tracker Handoff

## Current State

- Repo: `https://github.com/Roman-Faria1/cs-skin-tracker.git`
- Current branch: `feat/v0-3-alerts`
- Latest merged main commit: `c38bc3b` (PR #3, v0.2 reliability). The v0.2 feature branch was merged and deleted.
- Main stack: TypeScript, pnpm workspaces, Next.js, NestJS/Fastify, Drizzle, Postgres, Redis/BullMQ.
- Data provider: CS2Cap free-tier live prices via `GET https://api.cs2c.app/v1/prices`.
- v0.1 is effectively complete for personal MVP usage.
- v0.2 reliability, integration/CI coverage, opt-in scheduled collection, and watchlist transfer are merged.
- Current slice: v0.3 cached alert rules and persisted in-app history. Portfolio valuation follows in a separate slice.
- Alert engine/API/UI complete and locally verified on this branch; not yet pushed or opened as a PR. Migration `0003_alert_history.sql` adds lifecycle fields and append-only `alert_events` with unique `(alert_id, generation)` and is applied to local app/test DBs.
- Alert rules are one-shot: `active -> triggered`, then explicit rearm (new generation). Editing also rearms; pause/resume preserves the armed baseline. Global advisory transaction lock serializes rule mutations/evaluation, preventing duplicate events across manual/worker refreshes.
- Price-below is strict `<` USD; provider spread is `>=` USD across at least two fresh markets. Percent-change is absolute `>=` percent from a positive, fresh, provider-specific quote captured when armed; triggering requires newer collection AND source times. Price rules exclude stale/unknown/future quotes. Stale-data uses oldest source/collection time in scope, or elapsed time since arming if no quote exists; whole-hour thresholds 1-8760.
- `GET/POST /alerts`, `PUT/PATCH/DELETE /alerts/:id`, `GET /alerts/events?cursor=...`, and `POST /alerts/evaluate`. All evaluation reads cached snapshots only; after refresh (including skipped/failed refreshes) evaluation is best effort and errors are returned separately. History pages use stable timestamp/UUID cursors (50/page) and retain names/configuration/snapshot evidence when rules/items are deleted. Alert cap: 1000 rules.
- Alerts screen: create/edit, provider filters, active checkbox, rearm, delete confirmation, cache-only condition checks, paginated history with evidence. Rules for removed watchlist items remain visible but do not fire; add the item back to edit/rearm.
- No standalone alert timer yet: evaluation runs after manual/worker refresh or the Alerts screen's Check Conditions command. Worker remains opt-in/disabled. No email/push notifications. This is still a local single-user app without an auth gate; do not expose it publicly.
- Root Vitest config serializes files because repository suites reset one shared dedicated test database; project-level `fileParallelism` was not honored by the workspace runner. Unit/provider tests remain fixture-only.
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
- Worker tests use mocked API responses; `TEST_REDIS_URL` enables a real Redis queue/scheduler test. No CS2Cap calls are required.
- Scheduled collection committed as `dd8e4c2`.
- Watchlist transfer implemented: `GET /watchlists/default/export` and `POST /watchlists/default/import`, version 1 JSON `{ "version": 1, "items": ["market hash name"] }`. Watchlists, exports, and imports share a 1000-item capacity, browser file limit 1 MB. Adds and imports acquire the same watchlist row lock and reject capacity overflow before writing. Imports normalize duplicates, preserve canonical names, and never request prices. Exports never truncate items.
- Watchlist transfer committed as `bacd870`.
- Runtime is Node 22 (`.nvmrc` and CI). Playwright browser tests start the built web app on port 3100 and mock API traffic; they cover desktop/mobile import/export, stale labels, and cooldown messages.

## PR #3 Review Follow-Up

- PR: `https://github.com/Roman-Faria1/cs-skin-tracker/pull/3`.
- High: reservations explicitly persist the post-advisory-lock timestamp used for quota/cooldown checks, instead of PostgreSQL transaction-start `now()`. Regression test waits on the real lock and advances the application clock across a UTC month boundary.
- Medium: shared watchlist capacity and a row lock for both individual adds and imports keep complete exports importable, including concurrent writes near capacity. Capacity errors are shown in the browser.
- Medium: provider headers are parsed before reading the body; body-read failures retain status/rate-limit metadata in `Cs2CapError` so refresh stops after 401/403/429. Tests cover disconnected and timed-out bodies.
- Follow-up verification passed: 71 unit/API/integration tests (9 Postgres tests), 2 desktop/mobile browser tests, typecheck, lint, formatting, and production build. No real CS2Cap requests were made.

Recent commits:

```txt
bf410f8 feat(alerts): persist and evaluate cached market alert rules
bacd870 feat: add atomic watchlist import and export
dd8e4c2 feat: add opt-in scheduled watchlist collection
044b643 test: validate migrations and concurrent refresh reservations
6ca7a9a fix: select latest provider prices and label source freshness
f94f0f3 fix: enforce atomic refresh budgets and cooldowns
92d62ad Merge pull request #2
```

## Local Setup

Use Node 22 (also used by CI):

```bash
nvm install
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
- `apps/worker`: opt-in BullMQ scheduler that calls the protected API refresh service.
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
corepack pnpm test:e2e
```

For full integration coverage, set `TEST_DATABASE_URL` to the dedicated `_test` DB and
`TEST_REDIS_URL` to local Redis before running `pnpm test`. Browser tests require
`pnpm exec playwright install chromium` once and a successful web build. Stop the web dev
server before building/testing the production web output, since both use `.next`.

Validated recently:

- v0.3 alert slice, October 17, 2026: 109 unit/API/integration tests passed, including 17 Postgres tests and one real Redis scheduler test. Four Chromium browser tests passed (watchlist + alert lifecycle on desktop/mobile). Typecheck, lint, format, production build, and live cached alert/history API smoke checks passed. Screenshots inspected; no real CS2Cap requests made.
- Local app includes `/alerts` at `http://localhost:3000/alerts`; latest build served by web/API processes on 3000/4000. Test screenshots are ignored under `test-results/`.
- Typecheck passed.
- Lint passed.
- Format passed.
- October 17, 2026: 71 unit/API/integration tests passed under Node 22, including 9 Postgres tests and a real Redis scheduler test. Two Chromium browser tests passed (desktop/mobile), including capacity error feedback. No real provider requests were made.
- Migration `0002_snapshot_and_sync_indexes.sql` applied to local app DB and isolated test DB.
- Cached-data smoke checks passed: health, 12-item watchlist, export, and web all returned HTTP 200. Screenshots checked for desktop/mobile layout.
- Build passed. Next emits a warning that the Next ESLint plugin is not detected in the flat ESLint config; this is known and non-blocking.

Docker validation already completed locally:

```txt
Postgres: healthy on 127.0.0.1:5433
Redis: healthy on 127.0.0.1:6379
Seeded rows: 12 items, 6 providers, 12 watched items
```

## Next Recommended Work

1. Review `feat/v0-3-alerts`, push/open its PR, and address review feedback before merging. Do not declare the full v0.3 milestone complete yet.
2. Next separate branch: portfolio holdings (quantity, acquisition cost, notes), valuation from fresh cached prices, and stale/missing valuation labels. No additional CS2Cap calls.
3. Keep alert evaluation independent of provider calls and use fixtures. A dedicated stale-check timer and external notifications are future follow-ups; automatic collection remains disabled until deliberately configured.
4. Before hosted access, complete the v0.4 auth gate and secret/deployment configuration. The default watchlist remains single-user and the ordinary app API is not authenticated.

## Gotchas

- Do not expose `CS2CAP_API_KEY` to the frontend.
- Monthly budget tracks this application's reservations in UTC calendar months; requests made elsewhere with the key are not reflected in that ledger. Provider rate-limit responses stop the current refresh.
- Avoid using CS2Cap batch endpoints while on the free tier; batch is treated as a paid-tier optimization.
- The repo uses conventional commits and has a pre-commit typecheck hook.
- Git inferred a local author/committer identity for the alert work; confirm the intended GitHub name/email before publishing. Do not rewrite already shared history.
- Git operations that write `.git` may need elevated permission in this environment.
- Docker CLI may need Docker Desktop's bundled path if `docker` is not on `PATH`:

```bash
PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" docker compose ps
```
