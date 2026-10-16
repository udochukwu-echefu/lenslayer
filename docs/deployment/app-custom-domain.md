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
- `workers_dev: true` keeps the previous endpoint reachable during migration.
  It does not provide shared cookies or independent login sessions across hosts.

## Migration order

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

Keep the previous workers.dev endpoint and existing Auth0/CORS entries until
new-host sign-in and logout pass. Retiring or redirecting that endpoint is a
separate follow-up. Do not copy cookies or broaden cookie domains between hosts.
This migration does not change apex/marketing DNS, create new credentials,
rebuild the backend, migrate the database or activate optional providers.
