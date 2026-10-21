# Private Owner Authentication

## Scope

The private beta uses Supabase Auth email/password sign-in for exactly one configured
user UUID. There is no signup UI and other valid Supabase users are denied. Changing
the owner UUID transfers access to the same dataset; this is not user isolation.

The web server owns the session. Supabase SSR stores access/refresh tokens in HTTP-only,
SameSite=Lax cookies (Secure on HTTPS). Middleware verifies the user with Supabase and
refreshes sessions server-side. Browser requests use `/api/*`; a constrained web proxy
forwards only the server-held bearer token to NestJS, never browser cookies or client
Authorization headers. Responses are private/no-store and write requests require the
exact configured Origin. Tokens are only transported in HTTP-only cookies, never exposed
in JSON responses or browser-accessible storage. Provider keys remain on the API server.

The API uses a default-deny global guard and independently calls Supabase `getUser(token)`
on every protected request, checking the configured UUID. Missing/invalid tokens get 401,
other users get 403, and identity-service errors fail closed. Only `/health` is public;
`/internal/sync` retains its separate worker-token check, not owner-session access. The web
proxy cannot reach internal/health routes or arbitrary upstream hosts.

Migration `0004_private_api_rls.sql` enables RLS without browser policies on all nine app
tables and revokes direct `anon`/`authenticated` grants where those roles exist, including
TRUNCATE privileges that RLS does not cover. All application data access is through the
API's direct Postgres connection as table owner or a server-only role authorized to bypass
RLS. Do not use the browser `anon`/`authenticated` role for `DATABASE_URL`. No Supabase
service-role or secret API key is needed. Do not add blanket authenticated-user policies.

## Configure Supabase

1. Use a dedicated Supabase project. Disable public signups in its Auth configuration.
2. Create/confirm your owner email/password account through Supabase's administrative UI.
   Record its user UUID. Never put the password in environment files, Git, logs, or chat.
3. Obtain the project HTTPS URL and its `sb_publishable_...` API key. Legacy anon JWT keys
   and secret/service-role keys are intentionally not accepted by this configuration.
4. Set the following in the root `.env` locally, or in each host's environment for web/API:

```env
AUTH_ENABLED=true
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
PRIVATE_OWNER_USER_ID=YOUR_OWNER_USER_UUID
WEB_ORIGIN=http://localhost:3000
API_BASE_URL=http://127.0.0.1:4000
```

5. Apply checked-in migrations using the intended server database connection:
   `corepack pnpm db:migrate`. The auth project can be configured while keeping the existing
   local Postgres data; moving data to hosted Supabase is a separate deployment decision.
6. Restart web/API, visit `/login`, and sign in. There is no application password reset
   or signup flow yet; account provisioning/recovery is administered in Supabase.

The web config loads root environment files with Next's standard loader; the API loads
the root `.env`. Hosting must set matching auth/owner configuration on both services.
`API_BASE_URL` is server-only; `NEXT_PUBLIC_API_BASE_URL` is no longer used.

For hosting, use the canonical HTTPS web origin exactly, without a path; cookies must
be Secure and same-origin writes must match. Supabase URLs and web origins only allow
HTTP on loopback. Configure trusted HTTPS proxy/host routing before exposing the app.
Production always requires authentication; there is no production bypass. The former
`ALLOW_LOCAL_AUTH_BYPASS` setting is ignored and cannot disable production auth.
Local web scripts bind to loopback; a host
must deliberately use a public bind, for example `pnpm --filter @csst/web exec next start
-H 0.0.0.0 -p 3000`, with authentication enabled. The API binds publicly only with auth on.

## Local Unauthenticated Preview

Development defaults to the existing local-only experience when auth is disabled.
To work locally without Supabase configuration, use the development servers:

```bash
AUTH_ENABLED=false NODE_ENV=development corepack pnpm dev
```

The normal scripts bind to loopback. Production-build previews require configured owner
authentication. Browser tests also run with auth enabled against a loopback-only fixture
identity service; there is no test bypass in application code. Keep automatic collection
disabled during auth setup and verification.

## Verification Before Hosting

Local verification, October 21, 2026: the owner reports successful login and logout
against the real Supabase project. This does not complete the hosted checklist below.

- [ ] Owner can sign in against the real Supabase project and load cached data.
- [ ] No cookies redirects protected web paths to login; direct API reads/writes return 401.
- [ ] Another valid project user cannot access any data; raw API bearer requests are checked.
- [ ] Cookies are HTTP-only, Secure, SameSite=Lax, and not cached by the CDN/reverse proxy.
- [ ] Expired access tokens refresh server-side; invalid sessions fail closed.
- [ ] Logout clears this project's cookies without affecting other projects or devices.
- [ ] Cross-origin login/logout/data writes are rejected.
- [ ] All migrations are applied; Data API roles have no table privileges or permissive policies.
- [ ] Backups/restore, migration rollout, monitoring and deployed smoke checks are in place.

Automated tests cover these application behaviors with an isolated fixture identity/API
server and a restricted Postgres role; they do not replace real-provider/hosted verification.
The role tests require CREATE ROLE permission in the dedicated local/CI test database
environment and remove their randomly named role afterward.

Logout revokes the current refresh session and clears local cookies. Already issued bearer
JWTs can remain usable until expiry; do not promise immediate global token invalidation.
MFA, custom per-user/action rate limits, multi-user isolation, external notifications, and
application-managed account recovery are not included in this slice. Supabase's own auth
limits apply; deployed abuse controls remain a production-readiness follow-up.

Rollback application code without disabling RLS or regranting public access. An older
unauthenticated API must not be exposed publicly. Keep the existing data and migration
history intact; resolve server connection-role/configuration problems instead of weakening
the browser/database boundary.

References: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client),
[verified users](https://supabase.com/docs/reference/javascript/auth-getuser),
[RLS and table grants](https://supabase.com/docs/guides/database/postgres/row-level-security).
