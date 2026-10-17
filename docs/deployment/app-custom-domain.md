# Production app domain

The production dashboard uses `https://app.lenslayer.online`. The hostname maps
to the existing `lenslayer-dashboard` Worker. The root domain `lenslayer.online`
is available for the separate marketing site.

## Configuration

- `dashboard/wrangler.jsonc` declares the exact custom domain. Cloudflare manages
  its DNS record and HTTPS certificate. The compatibility date matches the
  qualified production runtime; invocation URL logs and traces remain disabled.
- `deploy/gcp/production-release.json`, the pure release renderer and Cloud Build
  dashboard default use the exact canonical app origin. Other authority/storage
  pins and numeric secret versions are unchanged.
- `workers_dev: false` declares retirement of the production endpoint
  `https://lenslayer-dashboard.udboy361.workers.dev`, retaining the exact app
  custom-domain route on the same Worker. This is source intent, not evidence of
  live retirement. Root performs the approved triggers-only update after auth
  validation; no full build or redeployment is required for this source task.
- Staging stays at `https://lenslayer-dashboard-staging.udboy361.workers.dev`
  using its separate `deploy/cloudflare/wrangler.staging.jsonc`; do not disable
  its endpoint or change account-wide workers.dev settings.

## Additive migration history and prerequisites

The migration initially kept production `workers_dev: true` and overlapping
allowlists. The following sequence describes that temporary additive phase,
not the final intended configuration or a claim that live steps have passed.

1. Confirm that the Cloudflare zone belongs to the production account and `app`
   has no conflicting DNS service. Attach the existing Worker and verify valid
   HTTPS and that the new hostname serves LensLayer before changing login URLs.
2. Add the following exact entries to the existing production Auth0 application,
   preserving its existing allowlists. Do not use wildcard callbacks or origins.

   | Auth0 setting | Additional entry |
   |---|---|
   | Allowed Callback URLs | `https://app.lenslayer.online/api/auth/callback/oidc` |
   | Allowed Logout URLs | `https://app.lenslayer.online/auth/signed-out` |
   | Allowed Web Origins | `https://app.lenslayer.online` |
   | Allowed Origins (CORS), if configured | `https://app.lenslayer.online` |

   Keep the issuer, audience, client ID, client secret and session secret.
3. Set the dashboard's existing `NEXTAUTH_URL` binding to
   `https://app.lenslayer.online`, preserving all other bindings. Update
   `LENSLAYER_PLATFORM_DASHBOARD_URL` on the production API and relevant workers
   and document job. During the transition, retain both backend CORS origins:

   ```text
   https://app.lenslayer.online,https://lenslayer-dashboard.udboy361.workers.dev
   ```

   Source defaults render the new canonical origin only. Live overlap must be
   applied explicitly with an env file or an update method that preserves the
   comma in the CORS value.
4. Use the existing qualified backend image for this configuration change. Do
   not run the full Cloud Build build/migration pipeline for a hostname change.
   Preserve min-zero/request-based CPU, scoped IAM, queue settings and secret
   references. Product model assistance and Calendar stay disabled.
5. Verify the actual deployed configuration, CORS and health, then complete a
   fresh sign-in on the new hostname. Confirm the same private workspace and
   owner role, and logout returning to `/auth/signed-out` on the new hostname.
   OAuth callback query strings, codes, tokens and cookies must not be logged.

## Legacy endpoint

The final intended production app origin is **only**
`https://app.lenslayer.online`. Keep unrelated approved callback/origin entries
and all staging settings; single canonical app origin does not authorize wiping
the existing Auth0 application allowlists.

### Retirement order (root-only live work)

1. Before retiring anything, validate new-host HTTPS, fresh sign-in, expected
   private workspace/owner role, API access and logout as described above.
   Preserve the existing issuer, audience, client ID, client secret, session
   secret and every other binding exactly. Keep invocation URL logging and
   traces disabled. Record only redacted acceptance results, never OAuth query
   strings, codes, tokens or cookies.
2. Apply the reviewed production triggers-only update using
   `dashboard/wrangler.jsonc`: `workers_dev: false`, with the exact
   `app.lenslayer.online` custom-domain route retained on `lenslayer-dashboard`.
   Do not create a redirect Worker or forward callback queries across origins.
   Read back the production routing state before removing old allowlist entries.
3. Verify the old hostname no longer serves LensLayer, login, API or callback
   handling and does not redirect OAuth codes to the new host. Check without
   credentials or real callback codes; do not depend on a specific Cloudflare
   error status. Recheck new-host sign-in/API/logout and staging availability.
4. Only after those checks pass, remove exactly these legacy entries from the
   existing production Auth0 application, leaving every other entry unchanged:

   | Auth0 setting | Legacy entry to remove |
   |---|---|
   | Allowed Callback URLs | `https://lenslayer-dashboard.udboy361.workers.dev/api/auth/callback/oidc` |
   | Allowed Logout URLs | `https://lenslayer-dashboard.udboy361.workers.dev/auth/signed-out` |
   | Allowed Web Origins | `https://lenslayer-dashboard.udboy361.workers.dev` |
   | Allowed Origins (CORS), if configured | `https://lenslayer-dashboard.udboy361.workers.dev` |

   Remove only `https://lenslayer-dashboard.udboy361.workers.dev` from backend
   CORS. The production app CORS origin is now `https://app.lenslayer.online`;
   preserve any unrelated approved entries. Read back allowlists and canonical
   URL bindings, verify new-host preflight/API access, and confirm the old origin
   is no longer allowed. Repeat fresh new-host login/logout and staging checks.

Cloudflare documents that disabling workers.dev does not disable version,
preview or deployment URLs. This change does not enable preview URLs or claim
to retire those separate surfaces; root should verify their existing exposure
without changing unrelated settings in this task.

### Rollback

If new-host auth fails before retirement, stop and retain the temporary overlap.
If retirement causes a regression, root may restore production `workers_dev:
true` via a reviewed triggers-only update and matching source change, retaining
the custom domain and all runtime/security settings. If allowlist cleanup has
already occurred, restore only the exact removed legacy Auth0/CORS entries from
the approved pre-change record before testing legacy login. Do not replace
whole allowlists or rotate credentials. Keep canonical new-host URL bindings
unchanged unless separately approved; re-enabling the old route alone does not
restore an independent legacy login session. Verify both hosts and staging,
then re-plan retirement. No cookie or OAuth-code transfer is a rollback method.

Do not copy cookies or broaden cookie domains between hosts; users should start
a fresh sign-in at the canonical origin rather than reuse old callback links.
This migration does not change apex/marketing DNS, create new credentials,
rebuild the backend, migrate the database or activate optional providers.

## Official references

Reviewed 2026-10-17 before this source change:

- [Cloudflare workers.dev routing and disabling](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Wrangler 4.151.0 configuration schema](https://unpkg.com/wrangler@4.151.0/config-schema.json)
  (the version pinned by `dashboard/package.json`; `workers_dev` is boolean,
  `routes` retains the custom domain, and `preview_urls` is separate).
