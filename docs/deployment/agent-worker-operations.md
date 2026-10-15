# Agent workflow / Calendar operations

Local SQLite, disposable PostgreSQL 17, and fake Google HTTP verification are
not deployed-staging/OIDC or real OAuth proof. See the
[exact interfaces](../architecture/agent-interface-changes.md).

## Migration and on-demand execution

Deployed workers must stop consuming idle CPU when there is no work. Agent
execution uses a **private Cloud Run HTTP service**, request-based CPU billing,
revision/service minimum instances **0**, maximum instances **1**, concurrency
**1**, and a 300-second request timeout. Cloud Tasks sends an empty authenticated
POST to `/drain`. The worker reads the durable ledger, processes available agent
work for a 120-second budget, schedules the next lease/expiry wake, and returns.
There is no idle polling loop. Google may retain a warm container before scaling
it to zero; request-based CPU is throttled while it has no request. This saves
idle compute, not the cost of actual jobs, cold starts, queue operations or recovery
requests. See [Cloud Run billing](https://docs.cloud.google.com/run/docs/configuring/billing-settings).

The review/email/retention lane is a separate Cloud Run Job:
`python -m backend.app.worker --documents-only --drain`. It initializes the
review model only after claiming a review and exits when its queues are empty.
Scheduled maintenance invokes that bounded job; it does not keep a process alive.
Legacy continuous mode remains available for local development only. Do not deploy
`python -m backend.app.worker` as an always-running service or enable an idle worker
pool. The old staging pool must stay at zero instances.

API commits enqueue wakes for new work, approvals, input replies, cancellation,
revocation and authority changes. Human waits park until their deadline. Action
completion resumes the hosted checkpoint. Expired leases recover the same output
ID; Calendar dispatch uncertainty continues to permit GET-only reconciliation.
Cloud Tasks uses a distinct invoker with `roles/run.invoker` on only the private
worker; the runtime can enqueue only its own queue and act as only that invoker.
No goals, source text or agent credentials are included in task payloads.

A required hourly authenticated `/recover` request reconstructs missed committed
state changes from the ledger, including supplied input and terminal runs. It also
adds expiry timers for external runs once they are within 29 days, respecting
[Cloud Tasks' 30-day limit](https://docs.cloud.google.com/tasks/docs/quotas).
Empty recovery performs database checks and returns without importing the agent
processor or calling models. Normal wakes use five-second slots to coalesce bursts;
early deliveries leave a different replacement timer before acknowledgment.
Enqueue failure from a delivered request returns 503 so Cloud Tasks retries. A
post-commit API crash is recoverable at the next scheduled check, **up to one hour
later**; deadlines continue to apply during that interruption. Monitor queue age
and failed recovery rather than claiming guaranteed immediate execution.

Set `LENSLAYER_PLATFORM_AGENT_WORKER_MODE=on_demand`, the canonical private
`_AGENT_WORKER_URL`, full `_AGENT_WORKER_QUEUE`, and `_AGENT_WORKER_INVOKER_EMAIL`.
The production build's first step refuses an unresolved/staging target, a paused
or unbounded queue, missing/paused/misdirected recovery, public worker invocation,
or an idle CPU/minimum-instance configuration. Provision and review these resources
before running the pipeline. The build updates hourly recovery before switching
the API. Use the [staging renderer](../../scripts/prepare-staging.py) to prepare
pinned, separate staging commands; bootstrap the private service only to resolve
its URL, then regenerate the plan with its actual URL before activation.

Private invocation requires both a narrow IAM policy and an enabled Cloud Run
Invoker IAM check. The service-level `run.googleapis.com/invoker-iam-disabled`
annotation must be absent or `false`; removing `allUsers` alone is insufficient.
Keep `run.googleapis.com/scalingMode` absent or `automatic`: manual scaling can
pin idle instances or disable dispatch even with both minimums set to zero.
Worker deployment commands explicitly set `--invoker-iam-check --scaling=auto`;
verify the effective service settings and unauthenticated rejection after rollout.

Apply migrations before switching the API and preserve the durable ledger:

```sh
python -m alembic -c backend/alembic.ini current
python -m alembic -c backend/alembic.ini upgrade head
python -m alembic -c backend/alembic.ini check
```

Migration `8f1a3c5e7b90` adds missing approval requested/resolved-user and lifecycle
creator indexes and replaces three nonunique indexes with unique indexes. Existing
table-level uniqueness remains intact throughout upgrade/downgrade. Metadata
also preserves secure-intake's historical table uniqueness, separately found by
PostgreSQL comparison. No data or uniqueness was discarded. Index creation is
ordinary transactional DDL, not PostgreSQL CONCURRENTLY: plan a maintenance
window or separately reviewed online-index rollout for large tables.

`9a2b4c6d8e10` adds scope/intent fields, immutable input records, encrypted
credentials/one-time OAuth states, and worker heartbeats. Existing v1 scopes and
canonical hashes remain compatible. Check backups before migrating. Do not
downgrade these tables while external actions are active/uncertain: a database
downgrade cannot undo remote events and would remove the recovery ledger.

## Health and durable counters

- `/health/live`: API liveness.
- `/health/ready`: database, additive action schema and object storage; no live
  provider request, no proof that OIDC login works.
- `/health/worker`: in on-demand mode, healthy `idle`/`scheduled` without an idle
  heartbeat; 503 when runnable work is overdue beyond the configured grace.
  Continuous local mode uses the latest loop heartbeat, 503 if absent/stale.
  `LENSLAYER_PLATFORM_WORKER_HEALTH_MAX_AGE_SECONDS` defaults to 2400, allowing
  existing long reviews. Rows older than one day are purged. Freshness is not
  proof that a particular job/process is healthy; even `--once` leaves a fresh
  heartbeat until the threshold. Also monitor the supervisor's process status.
- `/api/v1/organizations/{org}/agent-metrics`: owner/admin-only counts by
  run/action status, event counters, expired leases, retries, oldest queued age,
  and pending provider revocations. No credentials/source/goals/input metric labels.

Alert on overdue runnable work, failed queue/recovery deliveries, expired
leases/retries, any
`unknown_outcome` or `action.partial_effect`, and pending remote revocations.
Inspect stable action/event IDs before restarting or reconciling. Separate human
approval/input waits from queue backlog. Scope/credential failures require new
consent/delegation, never automatic scope expansion. Counters derive from the
retained ledger, survive restarts and disappear with tenant/run deletion; this
is not a separate analytics platform. Suppress authorization headers, callback
queries, SQL parameters and HTTP body/wire debug logs.

## Leases and external effects

Default action lease 60 seconds, attempts 3; configurable bounds 10–600 seconds,
1–10 attempts. Calendar HTTP uses fixed HTTPS endpoints, no redirects/environment
proxies, default five-second per-operation timeout (1–10), 64 KiB decompressed
response cap and elapsed response-read guard. An individual read can still use
its full timeout before the elapsed guard runs. Start Calendar production leases
at **180 seconds**, then tune against measured request/dispatch duration.

Internal tasks still commit effect/read-back/outcome/events atomically. Calendar:
persist proposal/outbox → authorize and persist exact intent → commit → refresh
and initial GET → final scope/source/approval/lease check and committed dispatch
marker immediately before POST → one POST and GET → lock/revalidate/fence receipt.
No database lock/transaction spans slow HTTP. A stale worker cannot commit.

Before the dispatch marker, lease recovery can retry. After it, recovery is
GET-only—even if the worker crashed just before POST actually started. This
deliberately trades automatic liveness for avoiding duplicate effects. Timeouts,
5xx/429/duplicate IDs require read-back; conflicting events are never updated
or adopted. One 401 refresh is allowed; already-dispatched recovery still cannot
POST again. `unknown_outcome` stops automatic dispatch. Owner/admin reconciliation
is bounded by the same attempt budget, read-only, and never reopens a terminal
run. No arbitrary planner/code executes inside the worker.

An initial GET failure before the committed dispatch marker is a definite
non-write: `failed` with redacted `provider_read_failed`/`provider_response_invalid`
and `dispatch_may_have_effect:false`. It is not operator-reconcilable. The same
lookup failure after that marker is `unknown_outcome` with may-have-effect true;
the marker remains immutable and subsequent reconciliation cannot POST again.

Cancellation/revocation blocks new dispatch, not an already-started remote write.
In-flight actions retain a fenced lease for a verified `partial_effect` or
uncertain receipt. Invalid current policy can never produce run success.
There is no provider deletion/compensation API. Composite progress consists of
historical exact read-back receipts, not continuous object-state monitoring.

## Google setup: pending external release gate

Use a dedicated sandbox project/web OAuth client, enabled Calendar API, consent
test users and exact registered redirect URI. Only
`https://www.googleapis.com/auth/calendar.events.owned` is requested; no shared
calendar support or account/calendar discovery. Configure via deployment secrets:

```text
LENSLAYER_PLATFORM_GOOGLE_CALENDAR_CLIENT_ID
LENSLAYER_PLATFORM_GOOGLE_CALENDAR_CLIENT_SECRET
LENSLAYER_PLATFORM_GOOGLE_CALENDAR_REDIRECT_URI
LENSLAYER_PLATFORM_CONNECTOR_ENCRYPTION_KEY
LENSLAYER_PLATFORM_CONNECTOR_STATE_SIGNING_KEY
LENSLAYER_PLATFORM_CONNECTOR_HTTP_TIMEOUT_SECONDS=5
LENSLAYER_PLATFORM_AGENT_ACTION_LEASE_SECONDS=180
```

Encryption uses a generated Fernet key kept outside the database; state signing
requires at least 32 high-entropy characters. Missing encryption/client config
fails closed. Encrypted credentials bind organization/connection/client; never
place tokens in settings/events/prompts/responses. Refresh expiry, invalid_grant,
one bounded 401 refresh and exact scopes are checked; refresh revision CAS cannot
undo disconnect. Reconnect creates a new connection ID and requires new delegation.

**Google revocation is broader than one local connection:** official docs state
it invalidates the user's OAuth project grant/scopes/tokens for all clients in
that project, and propagation may be delayed. Use a dedicated project and warn
administrators about other grants for the same Google account/project. LensLayer
does not discover related accounts/grants using extra identity scopes. Subsequent
401/invalid_grant fails closed. Local disconnect blocks writes immediately.

OAuth callback is an authenticated frontend relay: the same initiating human
POSTs code/state to the API. The redirect UI must clear the code-bearing URL,
suppress access logs and avoid third-party scripts. The dashboard now implements
Settings consent start and `/calendar/oauth-return`; register exactly that path
on the dashboard origin. It clears the query before auth/workspace loading and
exchanges only on an explicit same-human owner/admin click. It persists no code,
signed state or provider credential. No-referrer/no-store headers do not redact
hosting access logs: configure query suppression before the live test.
Missing refresh token requires fresh consent. DPoP-bound grants,
RISC push revocation, automated encryption-key rotation and background remote
revocation retry are not implemented. Retry disconnect explicitly; use a reviewed
re-encryption procedure for key rotation. Replacing the master key alone makes
old credentials unavailable.

The server bridge also requires an independent high-entropy key:
`CALENDAR_SESSION_BINDING_KEY` on the dashboard and the exact same value in
`LENSLAYER_PLATFORM_CALENDAR_SESSION_BINDING_KEY` on the backend. It must differ
from connector encryption, state-signing and model keys. A cryptographic private
login-session identity is held only in the encrypted server session. The bridge
signs a short-lived one-use proof bound to user, organization, operation, body and
login-session fingerprint. Relogin invalidates old OAuth state; token refresh
preserves the initiating session. Missing proof/key fails closed. Browser session
JSON must not contain provider bearer/refresh tokens or the private session ID.

Calendar defaults to disabled (`LENSLAYER_PLATFORM_GOOGLE_CALENDAR_ENABLED=false`).
The optional model also defaults to disabled with a zero lifetime call allowance;
see the [provider and spending rules](../hosted-model-providers.md).

## October roadmap migrations and operational release

`b14e6f8a9023` adds retained private context and dependency/conditional/timed graph
records. `bf84e2c19a67` follows it with immutable model selection, durable global
spending reservations and Calendar session proofs. Readiness checks the required
tables and columns before accepting the new revision. Preserve ledger data and
backups before applying either migration. The two spent-budget tables deliberately
survive downgrade/reupgrade; rolling back source does not refund paid calls.

Use `scripts/prepare-production.py` to render the immutable source/digest release
plan, with private acceptance and traffic promotion as separate steps. It does
not deploy or migrate. `scripts/prepare-agent-monitoring.py` renders five policies
per environment: worker HTTP failures, ledger attention/unavailability, hourly
recovery failure, post-commit wake enqueue failure and at least three unsuccessful
Cloud Tasks attempts within fifteen minutes. It ignores ordinary future timers
and human approval waits. Policies stay disabled until an approved notification
channel is supplied; inspect existing names before creating duplicates.

Worker health observations are emitted before recovery/draining and again after
runnable work drains and enqueues successfully, within the existing request.
This preserves overdue backlog/expired-lease signals even when recovery clears
them successfully.
Hourly recovery detects missed commits without keeping an idle process alive.
There is no claim of immediate detection while a service has no request. Read the
[current acceptance record](../architecture/agent-roadmap-acceptance-2026-10-14.md)
before enabling a queue or advertising external provider/SDK acceptance.

## Opt-in disposable verification

```sh
export LENSLAYER_TEST_POSTGRES_ACK=create_disposable_schema
export LENSLAYER_TEST_POSTGRES_URL='postgresql+psycopg://lenslayer_test@/lenslayer_agent_test?host=/path/to/private/socket&port=55442'
make check-agent-postgres
python -m unittest discover -s tests -q
```

The harness accepts local hosts/Unix sockets, no password, database names
`lenslayer_agent_test`, `lenslayer_disposable_test` or `lenslayer_test`. It creates
UUID `ll_agent_test_*` schemas, excludes public from search_path, verifies database/
schema identity and drops only its own schema. Never point it at existing
production data. Missing opt-in means **skipped, not passed**.

After building the client packages, `make check-agent-integration` runs the
combined task/Calendar/MCP/planner/input workflows through the real disposable
API and worker with fake providers. It nonce-verifies each API before writing,
never loads real environment files, and removes its own data/processes afterwards.
CI supplies a fresh PostgreSQL 17 service bound to runner loopback and opts the
Python suite into isolated schemas; it also runs the client and HTTP checks.

For a later real-provider check, create a disposable owned secondary calendar and
supply `LENSLAYER_SANDBOX_GOOGLE_CLIENT_ID`, `_CLIENT_SECRET`, `_REDIRECT_URI`,
`_CALENDAR_ID` (ending `@group.calendar.google.com`) through an authorized sandbox:

```sh
export LENSLAYER_SANDBOX_GOOGLE_ACK=write_one_event_to_disposable_calendar
python -m backend.app.calendar_sandbox --run
```

It uses a fresh temporary local database, no .env, synthetic calendar-only goal,
real code exchange, explicit human approval, worker dispatch and GET verification.
It refuses primary calendars and missing acknowledgment. Code entry is hidden;
grant disconnect is attempted afterwards. The event is left for manual inspection/
deletion. Never retry uncertainty with a new key. Capture sanitized IDs/outcomes,
not codes/tokens. This real OAuth/provider harness was **not run** in the assignment.

## Staging commands/checklist

On an explicitly designated staging environment with real OIDC/operator-supplied
configuration, use the private on-demand worker and bounded job commands above. Then:

```sh
curl --fail "$STAGING_API/health/ready"
curl --fail "$STAGING_API/health/worker"
curl --fail --silent --header "Authorization: Bearer $STAGING_HUMAN_JWT" "$STAGING_API/api/v1/me"
curl --fail --silent --header "Authorization: Bearer $STAGING_HUMAN_JWT" "$STAGING_API/api/v1/organizations/$STAGING_ORG/agents"
curl --fail --silent --header "Authorization: Bearer $STAGING_HUMAN_JWT" "$STAGING_API/api/v1/organizations/$STAGING_ORG/agent-metrics"
```

Obtain the JWT from the authorized staging operator; do not paste it into history,
use local headers, or attach verbose output. Verify wrong audience/expired token
401, viewer approval/create/cancel/supply 403, and agent credential on human
routes 401. Execute the documented v1 retained-evidence workflow through real
OIDC approval and then a sandbox Calendar roundtrip through the authenticated
relay. In disposable staging data, terminate a worker after claim, recover the
same action/output ID, and exercise cancellation/revocation during fake slow
HTTP. Inspect ordered events/metrics and concrete read-back evidence, not planner
claims. Archive migration head, sanitized IDs and actual command results. The original staging evidence is recorded in [agent-staging-execution.md](agent-staging-execution.md).
A new image and actual Cloud Tasks/private-service verification are required for
the sleeping-worker change; previous continuous-pool evidence does not prove it.
