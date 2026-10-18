# Alerts Review

Reviewed October 17, 2026, through `c924abd`, before starting portfolio work.

## Findings

No blocking correctness or regression findings in the reviewed alert changes.
This is a local code review, not a production security audit or independent approval.

## Scope

- `apps/api/src/alerts`: rule validation, provider scoping, fresh-quote eligibility,
  cent-based thresholds, percent baselines, one-shot lifecycle, and cached evaluation.
- `apps/api/src/watchlists/watchlists.service.ts`: best-effort evaluation after refresh,
  preserving refresh results when evaluation fails.
- `packages/db/drizzle/0003_alert_history.sql`: event evidence, nullable history
  references after deletion, and uniqueness by rule/generation.
- `apps/web/src/components/alerts-dashboard.tsx`: rule CRUD, pause/resume/rearm,
  source evidence, and paginated history.
- Tests: concurrent firing, transaction rollback, rearming, baseline timestamps,
  immutable evidence, cursor ties, validation, and desktop/mobile lifecycle.

## Remaining Limits

- App routes remain unauthenticated and single-user. Do not expose them publicly
  before the hosted-private-beta auth gate and user isolation work.
- Stale alerts evaluate on refresh or explicit condition checks; no independent
  clock-based evaluator exists. The worker is opt-in and remains disabled locally.
- Provider and browser tests use fixtures. Live provider failures, production
  networking, and hosted operations are not end-to-end verified here.
- Browser coverage exercises a representative rule lifecycle, not every rule-kind
  and failure combination. Engine/API/Postgres tests cover the core conditions.

## Verification

The alert slice passed 109 unit/API/integration tests and four desktop/mobile
browser tests, plus typecheck, lint, formatting, and production build. The portfolio
regression run also keeps these alert tests passing. No real CS2Cap calls were made.
