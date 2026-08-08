# Cloudflare Beta Deployment

This is the cheapest Cloudflare-first path for user testing Lenslayer without rewriting the Python backend.

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

## 3. Deploy the API container

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
LENSLAYER_PLATFORM_OIDC_ISSUER=https://identity.example.com/
LENSLAYER_PLATFORM_OIDC_AUDIENCE=https://api.lenslayer.example
LENSLAYER_PLATFORM_OIDC_JWKS_URL=https://identity.example.com/.well-known/jwks.json
LENSLAYER_PLATFORM_CORS_ORIGINS=https://app.lenslayer.example
LENSLAYER_PLATFORM_OBJECT_STORAGE_BACKEND=s3
LENSLAYER_PLATFORM_S3_BUCKET=lenslayer-documents
LENSLAYER_PLATFORM_S3_ENDPOINT_URL=https://ACCOUNT_ID.r2.cloudflarestorage.com
LENSLAYER_PLATFORM_S3_REGION=auto
LENSLAYER_PLATFORM_S3_ACCESS_KEY_ID=replace-me
LENSLAYER_PLATFORM_S3_SECRET_ACCESS_KEY=replace-me
```

Point a Cloudflare proxied DNS record such as `api.lenslayer.example` at the API host.

## 4. Deploy the dashboard to Cloudflare Workers

From `dashboard/`, set Worker secrets:

```bash
npx wrangler secret put PLATFORM_API_URL
npx wrangler secret put NEXTAUTH_URL
npx wrangler secret put NEXTAUTH_SECRET
npx wrangler secret put AUTH_OIDC_ISSUER
npx wrangler secret put AUTH_OIDC_CLIENT_ID
npx wrangler secret put AUTH_OIDC_CLIENT_SECRET
```

Recommended values:

```env
PLATFORM_API_URL=https://api.lenslayer.example
NEXTAUTH_URL=https://app.lenslayer.example
AUTH_OIDC_ISSUER=https://identity.example.com
```

Deploy:

```bash
cd dashboard
npm run cf:deploy
```

Then attach the custom domain in Cloudflare Workers and set the OIDC callback URL:

```text
https://app.lenslayer.example/api/auth/callback/oidc
```

## 5. Beta guardrails

- Keep beta invite-only.
- Use OIDC from day one; do not expose local auth.
- Keep source document retention off by default unless users explicitly opt in.
- Start with a 10-20 user beta and a small upload-size limit.
- Review R2 object access and Neon usage weekly.
- Add Sentry before increasing the tester pool.
