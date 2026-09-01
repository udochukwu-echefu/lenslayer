# Cloudflare Beta Deployment

This is the cheapest Cloudflare-first path for user testing LensLayer without rewriting the Python backend.

## Recommended beta architecture

- Dashboard: Cloudflare Workers running the Next.js app through OpenNext.
- Domain, TLS, caching, and security headers: Cloudflare.
- Document storage: Cloudflare R2 through the existing S3-compatible backend adapter.
- Database: Neon Free Postgres.
- API and worker: a free container host such as Koyeb, proxied behind a Cloudflare DNS record.

Cloudflare Python Workers support FastAPI in beta, but this backend currently depends on SQLAlchemy, psycopg, boto3, OCR tooling, and a long-running worker process. Running it as a normal container is the safer beta path. Cloudflare Containers can run the API later, but that currently requires the paid Workers plan rather than the free plan.

## 1. Create Cloudflare resources

Create an R2 bucket:

```bash
lenslayer-documents
```

Create an R2 API token with object read/write access for that bucket. Keep the account id, access key id, and secret access key for the API environment.

Optional: create a second R2 bucket for OpenNext incremental cache later. The dashboard config does not require it for the first beta.

## 2. Create Neon Postgres

Create a Neon Free project and copy the pooled Postgres connection string. Use the `postgresql+psycopg://` SQLAlchemy form if needed.

Run migrations before opening the beta:

```bash
alembic -c backend/alembic.ini upgrade head
```

## 3. Configure Auth0

Create an Auth0 **Regular Web Application** and an Auth0 API whose identifier matches the LensLayer API audience, for example `https://api.lenslayer.example`.

Configure the application:

- Allowed callback URL: `https://app.lenslayer.example/api/auth/callback/oidc`
- Allowed logout URL: `https://app.lenslayer.example/auth/signed-out`
- Allowed web origin: `https://app.lenslayer.example`
- Grant types: Authorization Code and Refresh Token
- Database connection: enable public signup if self-service accounts are allowed
- Google social connection: configure a Google OAuth web client with `https://YOUR_TENANT.auth0.com/login/callback`, add its client ID and secret to the Auth0 Google connection, and enable that connection for the LensLayer application

Enable **Allow Offline Access** for the Auth0 API and refresh-token rotation for the application. Add a post-login Auth0 Action so the custom API access token carries the identity claims required by LensLayer:

```js
exports.onExecutePostLogin = async (event, api) => {
  const namespace = "https://lenslayer.app";
  if (!event.user.email_verified) {
    api.access.deny("Verify your email address before using LensLayer.");
    return;
  }
  api.accessToken.setCustomClaim(`${namespace}/email`, event.user.email);
  api.accessToken.setCustomClaim(`${namespace}/email_verified`, event.user.email_verified);
  api.accessToken.setCustomClaim(`${namespace}/name`, event.user.name || event.user.email);
};
```

Attach the Action to the Login flow. Signup remains hosted by Auth0 Universal Login; LensLayer's `/signup` route starts that flow with Auth0's signup hint.

## 4. Deploy the API container

Use `backend/Dockerfile` for the FastAPI service and `backend/Dockerfile.worker` for the background worker. Both Dockerfiles expect the repository root as the build context.

API command:

```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

Worker command:

```bash
python -m backend.app.worker
```

Set these API and worker environment variables:

```env
GROQ_API_KEY=replace-me
LENSLAYER_PLATFORM_ENVIRONMENT=production
LENSLAYER_PLATFORM_AUTO_CREATE_SCHEMA=false
LENSLAYER_PLATFORM_DATABASE_URL=postgresql+psycopg://user:password@host/db?sslmode=require
LENSLAYER_PLATFORM_AUTH_MODE=oidc
LENSLAYER_PLATFORM_OIDC_ISSUER=https://YOUR_TENANT.auth0.com/
LENSLAYER_PLATFORM_OIDC_AUDIENCE=https://api.lenslayer.example
LENSLAYER_PLATFORM_OIDC_JWKS_URL=https://YOUR_TENANT.auth0.com/.well-known/jwks.json
LENSLAYER_PLATFORM_OIDC_EMAIL_CLAIM=https://lenslayer.app/email
LENSLAYER_PLATFORM_OIDC_NAME_CLAIM=https://lenslayer.app/name
LENSLAYER_PLATFORM_OIDC_EMAIL_VERIFIED_CLAIM=https://lenslayer.app/email_verified
LENSLAYER_PLATFORM_OIDC_REQUIRE_VERIFIED_EMAIL=true
LENSLAYER_PLATFORM_CORS_ORIGINS=https://app.lenslayer.example
LENSLAYER_PLATFORM_OBJECT_STORAGE_BACKEND=s3
LENSLAYER_PLATFORM_S3_BUCKET=lenslayer-documents
LENSLAYER_PLATFORM_S3_ENDPOINT_URL=https://ACCOUNT_ID.r2.cloudflarestorage.com
LENSLAYER_PLATFORM_S3_REGION=auto
LENSLAYER_PLATFORM_S3_ACCESS_KEY_ID=replace-me
LENSLAYER_PLATFORM_S3_SECRET_ACCESS_KEY=replace-me
```

Point a Cloudflare proxied DNS record such as `api.lenslayer.example` at the API host.

## 5. Deploy the dashboard to Cloudflare Workers

From `dashboard/`, set Worker secrets:

```bash
npx wrangler secret put PLATFORM_API_URL
npx wrangler secret put NEXTAUTH_URL
npx wrangler secret put NEXTAUTH_SECRET
npx wrangler secret put AUTH_OIDC_ISSUER
npx wrangler secret put AUTH_OIDC_AUDIENCE
npx wrangler secret put AUTH_OIDC_CLIENT_ID
npx wrangler secret put AUTH_OIDC_CLIENT_SECRET
```

Recommended values:

```env
PLATFORM_API_URL=https://api.lenslayer.example
NEXTAUTH_URL=https://app.lenslayer.example
AUTH_OIDC_ISSUER=https://YOUR_TENANT.auth0.com
AUTH_OIDC_AUDIENCE=https://api.lenslayer.example
```

Disable synthetic public access in the environment that runs the dashboard build. This is a public build-time variable, not a secret:

```env
NEXT_PUBLIC_LENSLAYER_PUBLIC_ACCESS=false
```

Deploy:

```bash
cd dashboard
npm run cf:deploy
```

Then attach the custom domain in Cloudflare Workers. The Auth0 callback URL is:

```text
https://app.lenslayer.example/api/auth/callback/oidc
```

## 6. Beta guardrails

- Keep beta invite-only.
- Use OIDC from day one; do not expose local auth.
- Keep source document retention off by default unless users explicitly opt in.
- Start with a 10-20 user beta and a small upload-size limit.
- Review R2 object access and Neon usage weekly.
- Add Sentry before increasing the tester pool.
