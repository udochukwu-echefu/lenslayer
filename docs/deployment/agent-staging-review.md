# Agent service staging deployment review

The preparation record below is followed by the [staging execution record](agent-staging-execution.md).
After explicit approval, the image, isolated database/storage/identity, login
application, API, dashboard and workers were deployed. Real private document-task
acceptance passed through hosted assignment and SDK/MCP; the continuous worker was
paused afterward. Human staging review and production rollout remain pending.

The finish phase prepares a separate Cloudflare dashboard, Cloud Run API,
review job, migration job and continuous agent worker pool. It does not deploy
them. The existing `lenslayer-api`, `lenslayer-review-worker`, production Neon
secrets and `lenslayer-documents` bucket remain outside this staging plan.

The non-secret [manifest](../../deploy/staging/manifest.json) defines the exact
resources. The proposed dashboard origin is not a claim that a Worker exists.
The API uses `ENVIRONMENT=production` so the same PostgreSQL, OIDC, private storage,
scanner, email and migration safety checks apply to staging.

## Prepare the review bundle

From the repository root:

```sh
python scripts/prepare-staging.py --output-dir /private/tmp/lenslayer-staging-review
# Optional: names-only Google Cloud inventory; never reads secret values.
python scripts/prepare-staging.py --output-dir /private/tmp/lenslayer-staging-review --check-cloud
```

The private output directory contains `plan.json`, `review.md` and non-secret
runtime environment files. The script never executes the generated commands.
It refuses production resource names, production audience, credentials in URLs,
secret values and unpinned secret versions. Actual `.env` files, dependency trees,
local auth folders and symlinks are excluded from its source fingerprint.

The first two commands build the staging image and resolve its digest. Before
deploying, rerender with the returned immutable digest:

```sh
python scripts/prepare-staging.py --output-dir /private/tmp/lenslayer-staging-review \
  --image-digest sha256:THE_64_HEX_CHARACTER_BUILT_STAGING_DIGEST
```

Until then the deployment arguments contain `BUILD_IMAGE_DIGEST_REQUIRED` and
cannot reference an image. The build uses a distinct staging image namespace;
it does not overwrite the production runtime/cache tags. Run the reviewed build
and deployment commands only after provisioning the dependencies below and
approving the concrete plan.

## Dependencies to provision

1. Create an **empty** staging PostgreSQL database or isolated empty Neon branch.
   Use dedicated pooled/direct database credentials; do not clone customer data
   or reuse production database URLs. Apply Alembic using the direct URL before
   starting the API/worker with the pooled URL.
2. Create the private `lenslayer-documents-staging` R2 bucket and bucket-scoped
   credentials. Do not make it public or bind document credentials to the dashboard.
3. Create `lenslayer-staging-runtime` and grant access only to the staging secrets
   named below; use the pinned numeric version references in deployments.
   Build/deployment identity needs the existing documented
   Cloud Build/Artifact Registry/Cloud Run roles and permission to use this identity.
4. Create a staging OIDC API with audience `https://api.lenslayer.staging`, and a
   separate dashboard OIDC application. Keep the existing namespaced email/name/
   verified-email claims. Add the exact staging login callback and return/logout
   origins; a production login callback is insufficient.
5. Store these secret values in Google Secret Manager as new staging secrets:
   `lenslayer-staging-neon-pooled-url`, `lenslayer-staging-neon-direct-url`,
   `lenslayer-staging-r2-access-key-id`, `lenslayer-staging-r2-secret-access-key`,
   `lenslayer-staging-cloudmersive-api-key`, `lenslayer-staging-resend-api-key`,
   `lenslayer-staging-groq-api-key`. The manifest initially pins version `1`;
   update references when the actual provisioned versions differ. Never place
   secret values in the manifest, commands or review bundle.
6. Configure the staging dashboard's server-side secrets: `PLATFORM_API_URL`,
   `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `AUTH_OIDC_ISSUER`, `AUTH_OIDC_AUDIENCE`,
   `AUTH_OIDC_CLIENT_ID`, `AUTH_OIDC_CLIENT_SECRET`. Use the actual staging API URL,
   the proposed staging origin and separate application credentials. Register
   `https://lenslayer-dashboard-staging.udboy361.workers.dev/api/auth/callback/oidc`.

Read-only inspection on 9 October 2026 found the existing production API and
review/migration jobs in project `lenslayer`, and seven production secret names.
No staging secret names were present. Their values were not inspected. This
inventory does not establish staging access, provisioning or deployment readiness.

## Dedicated agent worker

The reviewed agent command is `python -m backend.app.worker --agents-only` in a
Cloud Run worker pool. It continuously advances hosted checkpoints and existing
approved actions without waiting for long document review jobs. Review/email
work continues in the separate `--drain` job.

The generated pool deployment uses `--instances=0`. The plan separately includes
activation with `--instances=1` and pause with `--instances=0`. Approve activation
and cloud budgets before running it: Google bills manually provisioned worker
instances while idle. This is materially different from the previous hourly
review job and API scale-to-zero setup. See [worker pool scaling](https://docs.cloud.google.com/run/docs/configuring/workerpools/manual-scaling)
and [worker pool deployment](https://docs.cloud.google.com/run/docs/deploy-worker-pools).

After activation, check agent-specific worker readiness, assignment → scoped run
→ approval → receipt, cancellation and restart recovery. Stop the pool when the
review session ends if continuous staging operation is not approved. Do not
interpret a document-review heartbeat as proof that the agent lane is processing.

## Dashboard build and OAuth logs

Build in a clean isolated checkout without production `.env.local`. Keep the
public API URL unset to use the authenticated server-side proxy, or set it only
to the confirmed staging API origin. From `dashboard/`, after dependencies are
installed and the application tests/build pass:

```sh
npx opennextjs-cloudflare build --config ../deploy/cloudflare/wrangler.staging.jsonc
npx wrangler deploy --dry-run --config ../deploy/cloudflare/wrangler.staging.jsonc
# After review and staging Worker secret setup:
npx opennextjs-cloudflare deploy --config ../deploy/cloudflare/wrangler.staging.jsonc
```

The [staging Wrangler config](../../deploy/cloudflare/wrangler.staging.jsonc) uses
an independent Worker and assets. Invocation logs are disabled and traces are
disabled because callback request URLs can contain OAuth code/state. Custom
application logs must remain metadata-only; separately inspect any Cloudflare
Logpush, tail, proxy or external telemetry configuration before live consent.
Disabling invocation logs does not certify every provider's logging. See
[Workers logging configuration](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).

## Completed preparation checks — 9 October 2026

The final combined source passed 493 distinct tests, including 78 disposable
PostgreSQL checks. Real loopback HTTP/API/database/worker tests covered all three
hosted goals, approvals, restart recovery, immutable replay and partial composite
completion. Provider HTTP and model transport were injected; live OIDC and real
provider/model access were not used.

The default Next.js production build and OpenNext Cloudflare staging build passed
with all 28 static pages. Wrangler staging `deploy --dry-run` completed with 74
assets and a 2,260.77 KiB compressed bundle. No Worker was published. The names-only
cloud inventory still requires seven new staging secrets and independent
database/storage/OIDC/runtime setup. See [finish verification](../architecture/agent-pivot-finish-verification.md).

## Optional Google and product model checks

Initial staging keeps Google configuration absent and product model mode disabled.
The deterministic hosted document task does not require a product model key.
Calendar/composite assignments require an active exact Calendar connection.

To enable a Google sandbox, change `calendar_enabled` to `true` and add numeric
versions for `google-calendar-client-id`, `google-calendar-client-secret`,
`connector-encryption-key` and `connector-state-signing-key`. Provision them as
`lenslayer-staging-*` secrets, register the exact staging `/calendar/oauth-return`
URI, and allow only the selected test users and implemented owned-events scope.
Use a disposable secondary calendar and one approved event. The existing sandbox
harness and [Calendar operations](agent-worker-operations.md) describe GET receipt,
refresh, disconnect and uncertain-effect recovery. Do not repeat an uncertain write.

Real model evaluation requires separate product API access, approved excerpt
handling and cost limits. OpenCode ChatGPT subscriptions are development accounts,
not product runtime credentials. The prepared deployment rejects `model_enabled`
until a separate reviewed model configuration and evaluation have been completed.

## Acceptance and rollback

Verify real OIDC role/tenant changes, retained TXT upload, hosted assignment,
human immutable approval, exact verified task receipt, cancellation/revocation,
restart/concurrent workers and empty migration drift. Then run the opt-in Calendar
flow if configured. Confirm the synthetic demo never triggers execution. Monitor
the agent worker heartbeat and owner/admin metrics; alert on a missing agent
heartbeat, unknown outcomes and failed hosted planning, without including source
text, OAuth fields or secrets in alerts.

Pause the staging agent pool first if a release check fails. Roll API/worker back
to a previously reviewed immutable image; additive database rows remain for audit.
Do not downgrade a populated database or delete remote events as an automatic
rollback. No deployment, live OIDC, Google event, model request or rollback was
executed while preparing this review.
