# CS Skin Tracker Roadmap

## v0.0 - Project Foundation

- [x] Initialize Git repo and monorepo structure.
- [x] Configure TypeScript strict mode, ESLint, Prettier, commitlint, and GitHub Actions CI.
- [x] Add local Docker Compose for Postgres and Redis.
- [x] Add `.env.example` for Supabase, CS2Cap, Redis, and app config.
- [x] Choose ORM: Drizzle.
- [x] Add base test tooling.

## v0.1 - Personal MVP Dashboard

- [x] Backend-only CS2Cap wrapper seam.
- [x] Free-tier-compatible CS2Cap live price lookup via `GET /prices`.
- [x] Internal API shape for item lookup, current prices, and watchlist reads/writes.
- [x] Initial Drizzle schema for core entities.
- [x] Starter frontend watchlist UI.
- [x] Persist real watchlist mutations through API service.
- [x] Wire CS2Cap live responses into snapshot persistence.
- [x] Add item detail chart from stored snapshots.
- [x] Add seed command for 10-25 common skins.
- [ ] Add paid-tier batch lookup path only after explicit Starter+ plan config.

## v0.2 - Data Quality & Historical Tracking

- [x] Initial `sync_runs` schema.
- [ ] Sync-run logging around all CS2Cap requests.
- [ ] Stale-data UI labels from persisted timestamps.
- [ ] Scheduled worker sync for watched items.
- [ ] Provider comparison view.
- [ ] Import/export watchlist.

## v0.3 - Alerts & Portfolio Features

- [x] Initial `alerts` and `portfolio_items` schema.
- [ ] Alert rule evaluation.
- [ ] Portfolio valuation.
- [ ] In-app alert history.

## v0.4 - Hosted Private Beta

- [ ] Deployment docs.
- [ ] Auth gate.
- [ ] Structured logging and error reporting.
- [ ] Backup/migration workflow.

## v1.0 - Public-Ready Baseline

- [ ] Multi-user hardening.
- [ ] Per-user rate limits.
- [ ] Audit trail.
- [ ] User-facing data-quality labels.
- [ ] Document known data limitations.
