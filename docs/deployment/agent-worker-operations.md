# Agent workflow / Calendar operations

Local SQLite, disposable PostgreSQL 17, and fake Google HTTP verification are
not deployed-staging/OIDC or real OAuth proof. See the
[exact interfaces](../architecture/agent-interface-changes.md).

## Migration and continuous execution

Run API and worker separately with the same database/secrets. Disable automatic
schema creation in staging/production. Apply migrations before the new services:

```sh
python -m alembic -c backend/alembic.ini current
python -m alembic -c backend/alembic.ini upgrade head
python -m alembic -c backend/alembic.ini check
python -m backend.app.worker
```

Supervise/restart the continuous worker. Default poll interval is two seconds;
each iteration claims at most one agent action and closes at most 1000 expired
agent runs. Existing review/email/retention maintenance shares this process;
long reviews can delay agent actions/expiry. Monitor queue age and use multiple
workers for the intended load. This is not a real-time scheduler. `--once`,
`--drain` and enqueue-triggered jobs do not replace continuous expiry/recovery.

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
- `/health/worker`: latest committed loop heartbeat, 503 if absent/stale.
  `LENSLAYER_PLATFORM_WORKER_HEALTH_MAX_AGE_SECONDS` defaults to 2400, allowing
  existing long reviews. Rows older than one day are purged. Freshness is not
  proof that a particular job/process is healthy; even `--once` leaves a fresh
  heartbeat until the threshold. Also monitor the supervisor's process status.
- `/api/v1/organizations/{org}/agent-metrics`: owner/admin-only counts by
  run/action status, event counters, expired leases, retries, oldest queued age,
  and pending provider revocations. No credentials/source/goals/input metric labels.

Alert on stale heartbeat, rising queue age/expired leases/retries, any
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

## Staging commands/checklist: pending, not executed here

On an explicitly designated staging environment with real OIDC/operator-supplied
configuration, run the migration/continuous-worker commands above. Then:

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
claims. Archive migration head, sanitized IDs and actual command results. No
staging deployment, provider consent or staging evidence was produced here.
