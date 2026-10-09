# Staging execution — 9 October 2026

**Status: deployed and verified for document tasks; ready for human staging review.**
The user explicitly approved the isolated staging deployment and reuse of existing
Cloudmersive, Resend and Groq keys for synthetic checks and notifications to their
signed-in account. [PR #1](https://github.com/udochukwu-echefu/lenslayer/pull/1) remains
unmerged. Production has not been deployed or reconfigured by this rollout.

Review the [staging dashboard](https://lenslayer-dashboard-staging.udboy361.workers.dev).
The continuous agent worker was paused after acceptance and is confirmed at
**zero instances**. No review job remains running. Calendar and the optional hosted
product model remain disabled.

## Source and build evidence

The API, migration, review job and agent pool use implementation commit
`d5c959b19112c98689af0bb8f9602f946ed10372`. Local verification passed 493 distinct
tests, including 78 disposable PostgreSQL checks; see [finish verification](../architecture/agent-pivot-finish-verification.md).
The [feature-branch test run](https://github.com/udochukwu-echefu/lenslayer/actions/runs/37935556456)
passed backend/PostgreSQL tests, migrations, SDK/MCP/planner integration,
dashboard tests/build and landing checks.

The staging image [Cloud Build](https://console.cloud.google.com/cloud-build/builds/fda1768a-3f56-4be7-86c5-7096c150c2b6?project=378218120849)
completed successfully. Runtime deployments are pinned to:

```text
europe-west1-docker.pkg.dev/lenslayer/lenslayer/platform-staging@sha256:452c2678f34436f84f64a13d66dbf6f778963ca4b667522e349ab3475aa894fb
```

Its source fingerprint is `review-3c77fa7460c678d5059dad4b`. Subsequent source
changes affect documentation and the dashboard, not the backend runtime image.
The corrected dashboard was built in a clean directory without production
environment files; 171 dashboard/config source files matched the checkout.
Default Next.js/Turbopack, TypeScript and OpenNext builds passed with 28 pages.
Staging Worker version `808d6b82-5305-49b3-ab8b-5a3a3d1ddb34` contains 74 assets,
a 2,261.05 KiB compressed bundle and 21 ms startup. It supersedes initial version
`240e5a90-0904-4ccb-9c77-7d3d6a79aeb5`.

## Provisioned resources

| Resource | Result |
| --- | --- |
| Runtime identity | `lenslayer-staging-runtime@lenslayer.iam.gserviceaccount.com`; access individually on seven staging secrets, no project-wide runtime role; invocation permission only on the new staging review job |
| Database | New empty Neon project `lenslayer-staging`, ID `autumn-hall-03375489`; PostgreSQL 17 in Frankfurt, Free plan; database `lenslayer_staging`, dedicated role `lenslayer_staging_owner` |
| Migration | `lenslayer-migrate-staging-hk49x` completed; schema head `ab3d5e7f9012`, 43 tables; live Alembic drift and pooled-connection checks passed |
| Database/storage secrets | Independent pooled/direct database URLs and staging bucket credentials, each pinned to version `1` |
| Provider secrets | Three staging containers populated at version `1` from explicitly approved existing scanner/email/analysis credentials; vendor accounts and quotas are shared |
| Object storage | Private `lenslayer-documents-staging`, public access disabled; Object Read & Write credential scoped only to this bucket, expires 16 October 2026 |
| Storage verification | Replacement credential passed synthetic PUT → GET → DELETE; probe removed |
| OIDC API | `LensLayer staging API`, audience `https://api.lenslayer.staging`; per-app user grant, machine access disabled |
| OIDC application | `LensLayer staging dashboard`, client `fA52SAnPZo395Hntq5p4QOrLlGgWToC7`; exact callback/sign-out return registered; one-hour access tokens and rotating refresh tokens with one-day idle/seven-day maximum lifetime |
| Identity claims | Existing verified-email/name post-login action inspected and left unchanged |
| API | `lenslayer-api-staging`, revision `lenslayer-api-staging-00001-5mb`; [canonical API origin](https://lenslayer-api-staging-th7nw37zha-ew.a.run.app); min 0/max 1 instances |
| Review job | `lenslayer-review-worker-staging`, tasks 1/retries 1; three on-demand executions succeeded and completed |
| Agent pool | `lenslayer-agent-worker-staging`, revision `lenslayer-agent-worker-staging-00001-w4r`; one instance during supervised checks, final manual instance count `0` |
| Dashboard | Staging Worker connected to the API through its authenticated server proxy; seven server-side API/session/OIDC secrets configured |
| OAuth logging | Staging invocation logs and traces disabled, no external telemetry destinations; application logs contain metadata |

Neon's default branch is named `production` inside the **separate staging project**.
It contains the new schema, not a customer-data clone.

The first newly generated staging R2 key was accidentally exposed in a tool result
before use. It was immediately rolled, invalidating its original values. Only the
replacement secret was stored and verified. Production credentials were not exposed
or rotated. Provider reuse was initially rejected by automatic approval review,
then completed after explicit user approval; those provider values were transferred
through memory/stdin without logging or writing them to disk.

## Real private acceptance

Google → Auth0 → the staging callback established the real signed-in user. The
private API created **LensLayer Staging Acceptance** through that session. The same
user is a viewer in a separate synthetic role-check organization: switching
organizations hid the assignment form with **Administrator access required**, and
the primary contract returned **Contract not found** while that separate workspace
was selected. Owner context was restored. These are live browser role/tenant checks;
the broader backend role matrix is automated, not claimed as a live viewer POST test.

A fictitious, nonbinding TXT agreement was uploaded through the supported browser
file chooser. Actual Cloudmersive scanning, private R2 retention, on-demand review
and Groq document analysis completed on the first review attempt. Resend accepted
one review-ready notification to the authorized signed-in account; its database
status is sent. Inbox arrival was not independently checked. Groq document analysis
is separate from the disabled hosted product planner model.

| Synthetic source | Identity |
| --- | --- |
| Contract | `aef0e474-0390-439e-99f7-ee83cc831522` |
| Retained version | `08af727e-0887-47c1-ad43-44ade936dec1` |
| File-byte SHA-256 | `2cf1d2078084b4377ae6a2b0d350eb3d8e54d2232c308c88f5805daef5908c04` |
| Extracted-text SHA-256 | `94d1bcd68a25fe3a542fba3aaf03d3ce32f392cdeb502c7e18e1db199d90d22d` |
| Retention | Original and annotated text retained seven days, expiring 16 October 2026 |

File-byte and extracted-text hashes differ because retained text includes line
annotations. Evidence receipts bind extracted text, not uploaded file bytes.

### Hosted assignment and restart

The real private dashboard assigned a deterministic follow-up with zero hosted
product-model calls. Run `c1a9291c-4da4-4741-9f2d-996ab0485192` retrieved the source
and proposed one immutable task. Pausing/restarting the continuous worker preserved
the same run/action/evidence IDs, zero attempts and zero tasks before approval.

The owner session approved the exact contract, assignee, title, description,
evidence and `2026-10-15T09:00:00Z` due time. The approved hash matched the original:
`00c1e4c2162b9ab128310b4b9c53968199906be0c9998c6971859a14234a8438`.
The worker created task `13129bbf-0e69-4e42-8664-c2084b14e985` in one attempt.
Run and assignment succeeded with a `database_read_back` verified receipt,
displayed in the dashboard with ordered approval/completion events.

### Developer SDK and actual stdio MCP

A synthetic delegation was inserted directly into the isolated staging database:
two tools on the retained contract, the signed-in assignee only, required approval,
one action per run, one-hour expiry. This setup does not claim to test delegation
creation through the dashboard. Its plaintext token stayed in process memory and
child-process input/environment; the database stored only its hash/prefix.

The server-side SDK and official MCP client connected to the actual staging API
and local stdio server. Discovery excluded Calendar tools. MCP retrieved/read the
evidence, verified its source hash and proposed an exact follow-up. The real owner
browser session separately approved it. Run `a9e2bc8e-b67c-4ca5-a2ae-f5a08b992ecd`
created task `100d3662-071c-48a7-8947-b47f5583f838` in one attempt, with verified
database read-back and six contiguous events.

Live checks also established:

- Identical run/action replay returned original IDs before and after completion;
  changed input with the same key returned `409`, creating no duplicate task.
- Agent bearers could not use human routes (`401`) or read another agent's run
  (`404`); out-of-scope retrieval returned `403`; deadlines beyond expiry returned `422`.
- Cancelling run `fd12c0bc-8817-40fb-ac11-e0cbc732f9b2` while awaiting approval
  cancelled its action with zero attempts and created no task.
- A transport-interrupted fixture was revoked before approval; its run failed with
  `agent_inactive`, its action was cancelled with zero attempts and no task was
  created. The positive retry used bounded retries and unchanged mutation input.
- Fresh SDK access after revocation returned `401`; all four temporary fixture
  credentials, including preflight/debug fixtures, are revoked. MCP stderr did
  not contain credentials or source excerpts.

An independent final database check found **exactly two workspace tasks**. Their
persisted contract, creator, assignee, due time, title, description, source
version/hash and action/run provenance match their immutable approved inputs.
Cancelled/revoked runs created no effects, and no active run remains.

## Dashboard corrections from staging review

The user identified select arrows touching the edges and contract step numbers
stretching into decorated boxes. Shared native selects now use a 16 px inset
chevron, 13 px edge spacing and 42 px text padding, preserving native selection,
keyboard behavior and validation. Forced-colors mode restores the native arrow.
Step numbers are plain, top-aligned tabular text with transparent background,
zero border and a live computed height of 24 px.

The 40 existing hosted-task/input-request tests were re-run and passed, alongside
focused ESLint and the clean Next.js/TypeScript/OpenNext build. They are a subset
of the earlier suite, not 40 additional distinct tests. Corrected controls were
used for the real hosted assignment above. Secret-free screenshots record both
UI corrections and both verified receipts.

## Final state and remaining release gates

Cloud Run confirms manual agent instance count `0`, paused at
`2026-10-09T14:47:53Z`. All three staging review executions completed successfully.
API liveness/readiness return `200`; unauthenticated private identity access
returns `401`. While running, agent-lane heartbeat/readiness passed. Staging uses
a 60-second heartbeat threshold; after pausing, `/health/worker` returned `503`
with no recent heartbeat, consistent with Cloud Run's zero-instance state.

Human staging review comes next, followed by a separately approved merge/production
rollout. Before sustained production operation, complete operational rollout review,
alert routing and any required live crash/role-matrix rehearsal. PostgreSQL
concurrency/fencing and broader role checks passed locally; every failure scenario
was not injected into this deployment. Browser automation could not read the owner
metrics route because direct API navigation was blocked; no session/token workaround
was used.

Calendar, the optional hosted product model, npm publication and a persistently
configured customer MCP host remain separate release decisions. No real Calendar
event, hosted product-model request, npm publication, merge or production deployment
occurred. Continuing staging beyond 16 October requires renewing its bucket
credential and reviewing source retention.

Metadata-only records and secret-free screenshots are under
`/private/tmp/lenslayer-staging-execution`, including `final-task-verification.json`,
`final-runtime-verification.json` and SDK/MCP audits. Reviewed commands remain in
`/private/tmp/lenslayer-staging-review/plan.json`. See the [staging plan](agent-staging-review.md)
for configuration/rollback and the [release checklist](../developer-release-checklist.md)
for broader gates.
