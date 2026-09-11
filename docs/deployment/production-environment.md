# Production environment reference

All backend variables use the `LENSLAYER_PLATFORM_` prefix. Values marked **secret** belong in Google Secret Manager and are injected into Cloud Run by secret reference.

## FastAPI and review job

| Variable | Secret | Purpose |
| --- | --- | --- |
| `ENVIRONMENT=production` | No | Enables production safety validation. |
| `AUTO_CREATE_SCHEMA=false` | No | Prevents runtime schema mutation; Alembic owns migrations. |
| `DATABASE_URL` | **Yes** | Neon pooled URL for API and worker. The migration job uses the direct URL. |
| `AUTH_MODE=oidc` | No | Requires Auth0 JWT validation. |
| `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL` | No | Auth0 API identity settings. |
| `OIDC_EMAIL_CLAIM`, `OIDC_NAME_CLAIM`, `OIDC_EMAIL_VERIFIED_CLAIM` | No | Namespaced Auth0 claim names. |
| `OIDC_REQUIRE_VERIFIED_EMAIL=true` | No | Rejects unverified identities. |
| `CORS_ORIGINS` | No | Exact Cloudflare dashboard origin. |
| `DASHBOARD_URL` | No | Base URL used in transactional email links. |
| `OBJECT_STORAGE_BACKEND=s3` | No | Selects the S3-compatible R2 adapter. |
| `S3_BUCKET`, `S3_ENDPOINT_URL`, `S3_REGION=auto` | No | Private R2 bucket coordinates. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | **Yes** | Bucket-scoped R2 credentials. |
| `MALWARE_SCAN_BACKEND=cloudmersive` | No | Requires remote scanning before storage. |
| `CLOUDMERSIVE_API_KEY` | **Yes** | Cloudmersive credential. |
| `CLOUDMERSIVE_API_URL` | No | Defaults to `https://api.cloudmersive.com`. |
| `EMAIL_BACKEND=resend` | No | Enables the transactional email outbox. |
| `RESEND_API_KEY` | **Yes** | Resend credential. |
| `RESEND_FROM_EMAIL` | No | Verified sender name and address. |
| `RESEND_API_URL` | No | Defaults to `https://api.resend.com`. |
| `EMAIL_MAX_ATTEMPTS` | No | Defaults to five delivery attempts. |
| `EMAIL_LEASE_SECONDS` | No | Reclaims email sends interrupted for 15 minutes. |
| `WORKER_MAX_ATTEMPTS` | No | Caps review attempts at three. |
| `WORKER_LEASE_SECONDS` | No | Reclaims review work interrupted for 35 minutes. |
| `GROQ_API_KEY` | **Yes** | Existing document-analysis credential; it has no platform prefix. |

Production startup fails closed if PostgreSQL, private S3-compatible storage, Cloudmersive, Resend, or OIDC is missing. Never expose any secret as a `NEXT_PUBLIC_` variable.

## Cloudflare dashboard Worker

These are server-side Worker secrets: `PLATFORM_API_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `AUTH_OIDC_ISSUER`, `AUTH_OIDC_AUDIENCE`, `AUTH_OIDC_CLIENT_ID`, and `AUTH_OIDC_CLIENT_SECRET`.

Only `NEXT_PUBLIC_LENSLAYER_PUBLIC_ACCESS=false` is a public build-time variable. The dashboard does not receive database, R2, Cloudmersive, Resend, or Groq credentials.
