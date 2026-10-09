# Hosted agent service operations

Configuration names for coordinator staging preparation (no deployment performed):

```text
LENSLAYER_PLATFORM_HOSTED_AGENTS_ENABLED=true
LENSLAYER_PLATFORM_HOSTED_AGENT_LEASE_SECONDS=180
LENSLAYER_PLATFORM_HOSTED_AGENT_MAX_ATTEMPTS=12
LENSLAYER_PLATFORM_HOSTED_AGENT_WAIT_SECONDS=15
LENSLAYER_PLATFORM_HOSTED_MODEL_ENABLED=false
LENSLAYER_PLATFORM_HOSTED_MODEL_API_KEY=<separately provisioned product API secret>
LENSLAYER_PLATFORM_HOSTED_MODEL_TIMEOUT_SECONDS=30
LENSLAYER_PLATFORM_HOSTED_MODEL_MAX_OUTPUT_TOKENS=2048
```

The optional model is fixed to `gpt-6.1-sol` with reasoning effort `high` at the
official OpenAI Responses API; no endpoint/model override, subscription/session
credential reuse or fallback. Default deterministic mode needs no model secret.
Do not set the product secret unless separately authorized; tests use fake HTTP.
Hosted lease must exceed twice the per-operation model timeout. One model call
per task is charged durably before HTTP; unknown charged outcomes never retry.

Use `python -m backend.app.worker --agents-only` for the dedicated planning/action
lane. It does not initialize document models, process reviews/email/lifecycle or
run document retention maintenance. It still expires agent runs, advances bounded
hosted tasks, dispatches existing agent actions and commits lane-aware heartbeats.
`/health/worker` accepts `agents` or backward-compatible `mixed` lane heartbeats,
never `documents`. No document-only heartbeat can prove dedicated agent readiness.
Supervise this continuously; `--once`/`--drain` are local maintenance modes.

Apply the additive hosted migration before API/worker startup; disable automatic
schema creation in staging/production. Existing production safety checks remain
unchanged even on separately named staging resources. Coordinator owns Docker,
Cloud Run/worker-pool preparation and environment examples; no Docker edits here.

Revision `ab3d5e7f9012` follows `9a2b4c6d8e10`. It adds hosted checkpoints,
unique organization/idempotency and run/delegation bindings, `execution_owner`
(historical rows default `external_agent`), and heartbeat `lane` (historical rows
default `mixed`). SQLite and PostgreSQL upgrade/downgrade/re-upgrade and metadata
alignment are tested. A downgrade removes hosted task history: use the feature
flag, not downgrade, to stop live planning while preserving records.

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

Exact human interface: [hosted API](../architecture/hosted-agent-api.md). Local
validation commands/results and remaining release gates are in
[finish verification](../architecture/agent-pivot-finish-verification.md) and the
historical [platform handoff](../architecture/agent-platform-finish-result.md).
