# Hosted agent service operations

Current operational guidance, updated 17 October 2026 from public combined source.
**Production model and Calendar remain disabled; no activation or acceptance is
claimed.** See [current release status](current-release-status.md),
[provider activation](production-provider-activation.md) and
[reviewed provider profiles](../../deploy/gcp/PROVIDER-PROFILES.md).

Safe defaults (not an activation command or secret-binding template):

```text
LENSLAYER_PLATFORM_HOSTED_AGENTS_ENABLED=true
LENSLAYER_PLATFORM_HOSTED_AGENT_LEASE_SECONDS=180
LENSLAYER_PLATFORM_HOSTED_AGENT_MAX_ATTEMPTS=12
LENSLAYER_PLATFORM_HOSTED_AGENT_WAIT_SECONDS=15
LENSLAYER_PLATFORM_HOSTED_MODEL_ENABLED=false
LENSLAYER_PLATFORM_HOSTED_MODEL_LIFETIME_CALL_LIMIT=0
LENSLAYER_PLATFORM_HOSTED_MODEL_LIFETIME_USD_LIMIT=0.00
LENSLAYER_PLATFORM_HOSTED_MODEL_TIMEOUT_SECONDS=30
LENSLAYER_PLATFORM_HOSTED_MODEL_MAX_OUTPUT_TOKENS=2048
LENSLAYER_PLATFORM_GOOGLE_CALENDAR_ENABLED=false
LENSLAYER_PLATFORM_GOOGLE_CALENDAR_PILOT_ENABLED=false
LENSLAYER_PLATFORM_GOOGLE_CALENDAR_PILOT_USER_IDS=
```

The approved optional product pilot is **DeepSeek only**: explicit provider
`deepseek`, fixed `deepseek-flash`, high effort at `https://api.deepseek.com/responses`.
The adapter registry also contains OpenAI; that is not paid admission or an approved
product path. Developer coding subscriptions never supply product credentials.
Deterministic mode needs no model secret. The release operator supplies separately approved
server-side product credentials through exact numeric secret refs, not this document.

Both model ceilings default to zero. Integrated Settings accepts call limit
**0..3** and finite Decimal USD limit **0..1.00**. The approved pilot sets explicit
limits of **3 admissions and USD1 total, no automatic refill**. Each admission burns
**USD0.319488** before HTTP; three reserve USD0.958464, not three dollars or a daily
allowance. Existing admissions count; no refunds/reset on failure, cancellation,
deletion or lower actual usage. Hosted lease must be **strictly greater than
`3 * model timeout + 15` seconds** (180 > 105 for timeout30). There is at most
**one HTTP model call per task**; a committed charge/unknown outcome never retries.

Calendar activation additionally requires the **private owner pilot**: enabled
Calendar and pilot flags, one reviewed canonical local owner UUID, the canonical
app callback and independent server-side OAuth/encryption/state/session bindings.
The release operator verifies owner membership, consent and live provider acceptance. Configuration
alone does not prove identity, calendar ownership or a successful event write.

Production uses the private `backend.app.agent_worker_service:app` on-demand lane:
service/revision **min0/max1**, request-billed CPU, concurrency1, authenticated
invocation and a bounded drain **at most 120 seconds**. No idle continuous polling
worker is a production workaround. The document-only job drains and exits and
receives no optional product-provider credentials. Use the source/snapshot-bound
guarded deployment helper described in the profile guide: it renders complete
API/agent-worker env/bindings, preserves reviewed active provider configuration
or aborts, and keeps fresh deployments disabled. Replacement flags do not preserve
omitted settings. The release operator owns separate migration, traffic and activation approvals.

Only for **local development**, `python -m backend.app.worker --agents-only`
can continuously supervise the dedicated planning/action lane. It does not
initialize document models, process reviews/email/lifecycle or
run document retention maintenance. It still expires agent runs, advances bounded
hosted tasks, dispatches existing agent actions and commits lane-aware heartbeats.
`/health/worker` accepts `agents` or backward-compatible `mixed` lane heartbeats,
never `documents`. No document-only heartbeat can prove dedicated agent readiness.
Local `--once`/`--drain` are bounded development/maintenance modes; they are not
instructions to replace the production on-demand service with a polling process.

## Schema history and recovery

The older hosted migration below is history, **not a new rollout requirement**.
The current combined `c7a4e9d2b630` head already includes hosted tables. The new
USD/call/pilot controls use the existing budget/ledger and need **no new migration**
on that head. Keep automatic schema creation disabled; the release operator still reviews any
actual database starting state, backup and migration path before deployment.

Revision `ab3d5e7f9012` follows `9a2b4c6d8e10`. It adds hosted checkpoints,
unique organization/idempotency and run/delegation bindings, `execution_owner`
(historical rows default `external_agent`), and heartbeat `lane` (historical rows
default `mixed`). SQLite and PostgreSQL upgrade/downgrade/re-upgrade and metadata
alignment are tested. A downgrade removes hosted task history: use the feature
flag, not downgrade, to stop live planning while preserving records.

Application counter/ledger records survive ordinary process restarts and tenant
deletion, but privileged database destruction or restoration of an older backup
can erase history. Recovery must preserve the **monotonic spending budget** and
never restore spent funds or silently recreate capacity; reconcile approved
spending evidence before resuming admission. Code is not protection against a
privileged rollback that removes both counter and reservations.

Claims use revision compare-and-swap; PostgreSQL additionally uses `SKIP LOCKED`.
Each deterministic step and its original evidence/proposal writes commit together
behind a final lease fence. Expired-lease successors reuse persisted run/evidence
IDs and stable `hosted-run-v1`, `hosted-task-v1`, `hosted-calendar-v1` keys. Waits
back off 15 seconds by default (bounded by the deadline) without consuming attempts
or model calls. Cancellation clears the lease immediately; removed authority and
revocation terminate a live wait on its next due observation. Verified terminal
run receipts are historical outcomes, not permission for new effects.

The model adapter has no tools, redirects, proxy environment or retry. It shares
at most 1,000 excerpt characters, limits response bytes to 65,536 and accepts only
one short strict decision. A lost lease or process crash after a committed charge
fails `model_outcome_unknown` on recovery; do not clear the charge to force a retry.
Calendar uncertain outcomes continue through the existing stable-ID reconciliation
policy, never another blind POST. Partial/unknown effects remain visible in run
details even when the hosted wrapper is failed/cancelled.

OAuth redirect query/code/state and model request/response/authorization bodies
must be excluded from access/wire/SQL logs. Keep the configured authenticated
Calendar relay and suppress code-bearing redirect logging. Hosted status/phases
are metadata only; requests contain caller-authored facts, never copied excerpts.
Source remains solely in the retained-evidence system. The model receives bounded
goal/facts and (document goals only) one retained excerpt after explicit UI
disclosure; its output is reduced to a strict decision, never stored raw.
Obtain permission for excerpt transfer and review provider retention/data-processing
terms: DeepSeek's stateless interface is not a zero-retention promise. The model
cannot change fixed facts, expand scope, approve actions or certify completion;
only matching verified read-back receipts establish the bounded task outcome.

Exact human interface: [hosted API](../architecture/hosted-agent-api.md). Historical
local validation commands/results are in
[finish verification](../architecture/agent-pivot-finish-verification.md) and the
historical [platform handoff](../architecture/agent-platform-finish-result.md).
