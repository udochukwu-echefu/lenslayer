# Production deployment: Cloudflare + Google Cloud Run

LensLayer's low-traffic production layout is:

- Cloudflare Workers serves the Next.js dashboard.
- A private Cloudflare R2 bucket stores uploaded source documents. The browser and dashboard Worker have no bucket credentials.
- Google Cloud Run serves the FastAPI API and scales to zero.
- A separate Cloud Run Job drains review and transactional-email queues. Cloud Scheduler starts it once per minute.
- Neon PostgreSQL stores application state. Runtime services use the pooled URL; the migration job uses the direct URL.
- Cloudmersive scans every upload before the API writes it to R2.
- Resend sends invitations and existing notification events from the database-backed email outbox.

This setup is designed to stay inside free allowances at low volume; it is not a guarantee of a permanently zero bill. Configure provider budget alerts and quotas before launch.

## 1. Provision accounts and resources

Create:

1. A private R2 bucket named `lenslayer-documents` and an R2 API token restricted to object read/write for that bucket.
2. A Neon project. Save both its pooled and direct connection strings in SQLAlchemy's `postgresql+psycopg://` form with TLS enabled.
3. A Cloudmersive API key.
4. A Resend API key and verified sending domain.
5. A Google Cloud project with Cloud Run, Cloud Build, Artifact Registry, Secret Manager, and Cloud Scheduler enabled.

Do not make the R2 bucket public and do not bind it to the dashboard Worker. Only the Cloud Run API and review job receive its S3-compatible credentials.

## 2. Store production secrets

Create these Google Secret Manager secrets. Their values must never be committed or passed as ordinary Cloud Run environment variables.

| Secret | Value |
| --- | --- |
| `lenslayer-neon-pooled-url` | Neon pooled runtime URL |
| `lenslayer-neon-direct-url` | Neon direct migration URL |
| `lenslayer-r2-access-key-id` | R2 access key ID |
| `lenslayer-r2-secret-access-key` | R2 secret access key |
| `lenslayer-cloudmersive-api-key` | Cloudmersive API key |
| `lenslayer-resend-api-key` | Resend API key |
| `lenslayer-groq-api-key` | Groq API key used by document analysis |

Create a runtime service account named `lenslayer-runtime` and grant it `roles/secretmanager.secretAccessor` only for those secrets. The Cloud Build service account also needs Cloud Run Admin, Artifact Registry Writer, Service Account User, and permission to execute the migration job.

## 3. Deploy API, migration job, and review job

Edit the non-secret substitutions at the top of [`deploy/gcp/cloudbuild.yaml`](../../deploy/gcp/cloudbuild.yaml), especially region, Auth0 URLs, dashboard URL, R2 endpoint, and verified Resend sender.

Create the Artifact Registry repository once, then submit from the repository root:

```bash
gcloud artifacts repositories create lenslayer --repository-format=docker --location=europe-west1
gcloud builds submit --config deploy/gcp/cloudbuild.yaml
```

Every build builds one immutable image, executes Alembic against Neon's direct endpoint, deploys FastAPI with the pooled endpoint, then updates the separate review job. If migrations fail, the API deployment does not proceed.

Cloud Run transport is unauthenticated so the Cloudflare server-side proxy can reach it, but application endpoints still require and validate the Auth0 bearer token. Restrict CORS to the production dashboard origin.

## 4. Schedule the review job

Use a dedicated scheduler service account with permission to run only `lenslayer-review-worker`:

```bash
gcloud scheduler jobs create http lenslayer-review-worker-every-minute \
  --location=europe-west1 \
  --schedule="* * * * *" \
  --uri="https://run.googleapis.com/v2/projects/PROJECT_ID/locations/europe-west1/jobs/lenslayer-review-worker:run" \
  --http-method=POST \
  --oauth-service-account-email=lenslayer-scheduler@PROJECT_ID.iam.gserviceaccount.com
```

The job uses PostgreSQL row locking, drains all queued document reviews and email deliveries, and exits. Resend requests use the delivery row ID as an idempotency key.

## 5. Deploy the Cloudflare dashboard

Set dashboard Worker secrets from `dashboard/`:

```bash
npx wrangler secret put PLATFORM_API_URL
npx wrangler secret put NEXTAUTH_URL
npx wrangler secret put NEXTAUTH_SECRET
npx wrangler secret put AUTH_OIDC_ISSUER
npx wrangler secret put AUTH_OIDC_AUDIENCE
npx wrangler secret put AUTH_OIDC_CLIENT_ID
npx wrangler secret put AUTH_OIDC_CLIENT_SECRET
```

Use the Cloud Run API URL for `PLATFORM_API_URL` and the final Cloudflare domain for `NEXTAUTH_URL`. Set `NEXT_PUBLIC_LENSLAYER_PUBLIC_ACCESS=false` during the production build, then run `npm run cf:deploy`. The Auth0 callback remains `https://YOUR_DASHBOARD_DOMAIN/api/auth/callback/oidc`.

## 6. Release verification

Before directing users to the deployment:

```bash
python -m unittest discover -s tests -v
alembic -c backend/alembic.ini upgrade head
cd dashboard && npm ci && npm run lint && npm test && npm run build
```

Then verify `/health/live`, `/health/ready`, Auth0 login, one clean upload, one EICAR rejection, review completion, R2 deletion for a non-retained document, and an invitation email. Set budget alerts in every provider console.
