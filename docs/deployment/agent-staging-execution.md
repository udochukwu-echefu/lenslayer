# Staging execution — 9 October 2026

**Status: partially deployed; private task acceptance is pending provider credentials.**
The user explicitly approved the isolated staging setup and deployment. The
feature branch is `codex/agentic-infrastructure`; [draft PR #1](https://github.com/udochukwu-echefu/lenslayer/pull/1)
contains the integrated agent infrastructure and hosted task implementation.
The original production service, database, storage credentials and dashboard
have not been deployed or reconfigured by this rollout.

## Source and build evidence

The implementation commit is `d5c959b19112c98689af0bb8f9602f946ed10372`.
Its [GitHub test run](https://github.com/udochukwu-echefu/lenslayer/actions/runs/37928349933)
passed, including PostgreSQL tests, migrations, agent integrations, dashboard
tests/build and landing checks. The preceding local verification passed 493
distinct tests; see [finish verification](../architecture/agent-pivot-finish-verification.md).

The staging image [Cloud Build](https://console.cloud.google.com/cloud-build/builds/fda1768a-3f56-4be7-86c5-7096c150c2b6?project=378218120849)
completed successfully. Runtime deployments are pinned to:

```text
europe-west1-docker.pkg.dev/lenslayer/lenslayer/platform-staging@sha256:452c2678f34436f84f64a13d66dbf6f778963ca4b667522e349ab3475aa894fb
```

Its source fingerprint is `review-3c77fa7460c678d5059dad4b`. The dashboard was
deployed from the clean OpenNext build whose 170 tracked dashboard/config files
matched the implementation checkout byte for byte: 74 assets and a 2,260.77 KiB
compressed Worker bundle. The initial Worker version is
`240e5a90-0904-4ccb-9c77-7d3d6a79aeb5`; subsequent secret configuration creates
new Worker versions without changing its application source.

## Provisioned resources and live checks

| Resource | Result |
| --- | --- |
| Runtime identity | `lenslayer-staging-runtime@lenslayer.iam.gserviceaccount.com`; secret access granted individually on the seven staging secrets, without a project-wide runtime role |
| Database | New empty Neon project `lenslayer-staging`, ID `autumn-hall-03375489`; PostgreSQL 17 in Frankfurt, Free plan; database `lenslayer_staging`, dedicated role `lenslayer_staging_owner` |
| Database secrets | Separate pooled and direct URLs stored as version `1` in staging Secret Manager |
| Migration | `lenslayer-migrate-staging-hk49x` completed; schema head `ab3d5e7f9012`, 43 tables; live Alembic drift check passed |
| Object storage | Private `lenslayer-documents-staging`, public access disabled; dedicated Object Read & Write credential scoped only to that bucket, expires 16 October 2026 |
| Storage verification | Replacement credential passed one synthetic PUT → GET → DELETE check; the probe was removed |
| OIDC API | `LensLayer staging API`, audience `https://api.lenslayer.staging`; user access uses a per-app grant, machine access disabled |
| OIDC application | `LensLayer staging dashboard`, client `fA52SAnPZo395Hntq5p4QOrLlGgWToC7`; exact callback and sign-out return registered; access tokens expire in one hour, rotating refresh tokens have a one-day idle and seven-day maximum lifetime |
| Identity claims | Existing deployed post-login action already supplies the namespaced verified email/name claims; it was inspected and left unchanged |
| Browser login | Real Google → Auth0 → staging callback completed; the private workspace correctly remained unavailable while its API was unconfigured; sign-out returned to the staging signed-out page |
| Dashboard | [Staging Worker](https://lenslayer-dashboard-staging.udboy361.workers.dev) deployed; six independent server-side login/session secrets configured; API URL awaits API deployment |
| OAuth request logging | Invocation logs unchecked, traces disabled, no external telemetry destinations configured in the staging Worker UI |
| Public agent preview | Explicit read-only synthetic view; no assignment form or running hosted agent; requires private owner/admin sign-in |
| API and workers | Staging API, review job and agent pool have not been deployed because three provider secret versions are missing; no continuous worker has been activated |

Neon's default branch is named `production` inside the **separate staging
project**. It contains the new schema, not a clone of customer records.

The first newly generated staging R2 key was accidentally exposed in a tool
result before use. It was immediately rolled, invalidating its original values.
Only the replacement secret was stored and verified. Production credentials were
not exposed or rotated.

## Exact remaining staging work

The scanner, email and document-analysis secret containers exist but have **no
enabled versions**:

- `lenslayer-staging-cloudmersive-api-key`
- `lenslayer-staging-resend-api-key`
- `lenslayer-staging-groq-api-key`

Automatic approval review rejected copying the existing production provider
keys into them because that would grant staging persistent access to shared
provider accounts and quotas. The rejected command did not execute: no existing
provider values were read or copied. A separate choice is pending between
explicitly approving reuse for synthetic document checks/test notifications to
the signed-in account and providing separate staging keys. Production database
and R2 credentials must remain separate in either case.

After the provider values are available:

1. Deploy the staging API and review job from the pinned image. Grant the staging
   runtime identity invocation access only to the new staging review job.
2. Configure the dashboard's actual staging API URL and prepare the agent worker
   pool with zero instances.
3. Activate one worker only for supervised checks. Verify real private OIDC
   identity and role/tenant isolation, retained synthetic TXT upload, hosted
   assignment, immutable human approval, exact verified task receipt,
   cancellation/revocation, replay/restart recovery and agent readiness.
4. Return the agent worker to zero instances even if a check fails. Record the
   results and leave the draft PR for staging review before merge/production.

Google Calendar and the optional hosted product model remain disabled by this
approved staging scope. Their live provider/model evaluation and npm publication
are separate release decisions, not prerequisites for this initial document-task
staging check. No real Calendar event, hosted product model request or npm
publication has occurred.

Metadata-only execution records and secret-free UI evidence are saved under
`/private/tmp/lenslayer-staging-execution`. The reviewed commands remain in
`/private/tmp/lenslayer-staging-review/plan.json`; the preparation script does not
run them automatically. See the [staging deployment plan](agent-staging-review.md)
for configuration and rollback details.
