# OpenCode assignment: platform half

You are implementing the platform half of LensLayer's pivot to agent
infrastructure. Work in this isolated snapshot, not the user's original checkout.
Use ONLY GPT-6.1 Sol at high effort. Never use Astra or invoke another model,
spawn another agent, alter model/account configuration, or delegate. The user
explicitly says to challenge wrong assumptions. Read this whole assignment and
implement the authorized local work rather than stopping at a plan.

Read `docs/architecture/agent-pivot-workstreams.md`,
`docs/architecture/agent-infrastructure-direction.md`,
`docs/architecture/agent-api-v1.md`,
`docs/architecture/agent-handoff-verification.md`, and the existing source/tests.
The current foundation has 83 Python tests and a verified internal task executor.

## Ownership and boundaries

Own `backend/`, Python `tests/`, root `requirements.txt`, `backend/README.md`,
`docs/deployment/`, and `docs/architecture/` except the coordination/assignment
documents. Add `docs/architecture/agent-platform-result.md` and
`docs/architecture/agent-interface-changes.md` when done.
Do not edit `sdk/`, `dashboard/`, `landing/`, `mcp/`, `hosted-agent/`, examples,
the root README, or the user's original checkout. Do not commit, stage, reset,
deploy, publish, provision paid services, contact people, read/copy real .env
secrets, or perform live provider writes. Do not use MCP tools for cloud writes.
Use fake providers/disposable local databases for development, with an opt-in
integration harness for real credentials supplied later.

Reuse Python dependencies from the original repository's `.venv` if this copy
lacks a venv; do not reinstall the entire environment. Determine its absolute
path from the environment note supplied by the coordinator. Installing a small
necessary dependency from its official package registry is allowed. Do not run
untrusted downloaded scripts.

## A. General durable workflows

The existing runtime supports only `workspace.tasks.create` and finishes its
run after one verified task. Extend it without breaking v1 clients/tests:

- Introduce a typed tool registry with versioned input validation, delegated
  resource scopes, execution adapter, and deterministic completion check.
- Add a resource abstraction that supports at least internal contracts and a
  connection-scoped external calendar target. Reuse existing contract scopes;
  avoid wildcard or cross-tenant access.
- Support an explicit composite/multi-action success condition and persist
  progress/checkpoints. Multiple verified actions must not mark a composite run
  successful until every required condition passes.
- Add `awaiting_input` and structured input request/resume operations with
  human/agent authorization, an immutable record of supplied input, and bounded
  run deadlines. Missing input is not authorization to broaden scope or change
  an already approved action. If a bounded API version is needed, keep v1 intact.
- Preserve transactional action intent, exact approval binding, leases/fencing,
  ordered events, bounded attempts/actions/evidence, cancellation, revocation,
  source retention, and current delegator/approver authority checks.
- Add additive migrations and update import/schema wiring where required.
- No arbitrary execution of agent code or unbounded planner in the API worker.

## B. First real connector implementation: Google Calendar

Implement a coherent calendar event creation tool with a typed input, explicit
connection/calendar target, stable event ID, source provenance, and a server
read-back completion check. First inspect any existing integration credential
patterns; connection metadata/upload import is not live provider access.

Consult official Google documentation for OAuth, events.insert/get and supported
event IDs, scopes, errors, revocation/refresh. Write source links and assumptions
in your result; do not invent API behavior.

- Tenant-scoped OAuth initiation/callback must validate signed/one-time state,
  bind the initiating human and organization, limit scopes, and avoid open
  redirects. Use existing human auth; owners/admins configure connections.
- Credentials must be encrypted or held in a proper secret reference; fail
  closed when encryption/client configuration is absent. Never store raw tokens
  in IntegrationConnection settings, audit/events, prompts, or responses.
- Handle refresh, expiry, disconnect/revocation, and scope changes. Queued
  actions cannot execute with a revoked/mismatched connection.
- Persist action intent before network I/O. Do not hold DB locks during a
  slow provider request. Verify the lease/delegation/approval before dispatch and
  fence outcome commits. Explain partial effects if cancellation races a write.
- Reconcile network timeout or duplicate event ID via stable ID and provider
  read-back. Use `unknown_outcome` where verification is genuinely ambiguous;
  never mark success or blindly duplicate external writes.
- Verify exact target/fields/source at completion. Reject an existing event
  with conflicting fields instead of silently taking ownership.
- Add meaningful fake-HTTP tests for tenant isolation, state replay, token
  redaction, refresh/revoke, successful write/read-back, timeout recovery,
  conflicting duplicates, stale leases, and partial effects.
- Add an opt-in disposable/sandbox integration harness. Report real OAuth/live
  provider verification as pending if credentials/consent are unavailable.

## C. Production reliability and cleanup

- Fix the specifically documented historical Alembic index drift through an
  additive migration after verifying metadata, upgrade/downgrade behavior,
  existing uniqueness semantics, and data preservation. Do not remove uniqueness
  merely to silence `alembic check`.
- Normalize legacy task response timestamps to explicit UTC without altering
  stored instants. Add a meaningful regression check.
- Add an opt-in PostgreSQL concurrency/recovery suite with disposable schema or
  database safeguards. Run it if a suitable local PostgreSQL is present; no
  access to existing production data. Skipped is not passed.
- Document continuous worker operation, readiness/health, leases/retries,
  bounded work, and actionable metrics for agent runs/actions/unknown outcomes.
  Instrument essential counters safely; avoid a new observability platform.
- Provide staging verification commands for real OIDC and migration/worker
  behavior; do not deploy or fabricate staging evidence.

## Validation and result

Run all Python tests, new migration roundtrip/metadata checks, meaningful
connector/workflow tests, and `git diff --check`. Preserve old v1 tests. Correct
failures before reporting completion. Explain any important tradeoff and any
original requirement you could not implement.

`agent-interface-changes.md` must include exact new payloads/routes/response
types/statuses plus backwards compatibility notes, for the other track.
`agent-platform-result.md` must contain changed files, actual commands/results,
implemented capabilities, missing external setup, and remaining code gaps. Your
final answer must distinguish implementation from a live provider/staging proof.
