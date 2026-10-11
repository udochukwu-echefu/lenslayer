# Hosted agent backend finish result — 9 October 2026

> Historical isolated OpenCode handoff. The coordinator subsequently integrated and independently verified the combined source; see [current finish verification](agent-pivot-finish-verification.md).

**Completed and locally verified.** Human owner/admin endpoints now enqueue durable
LensLayer-hosted document follow-up, Calendar-only and combined fixed-fact tasks.
Internal delegation has no usable browser bearer, expires at the exact deadline,
and always requires existing human action approval. Existing evidence, proposals,
fenced action execution and matching verified receipts remain the effect boundary.
The external v1 defaults/hashes and pre-existing integrated edits are preserved.

## Exact finish-phase files

- New modules: `backend/app/api/hosted_agents.py`,
  `backend/app/hosted_agent_model.py`, `backend/app/hosted_agent_models.py`,
  `backend/app/hosted_agent_plan.py`, `backend/app/hosted_agent_runtime.py`,
  `backend/app/hosted_agent_schemas.py`, `backend/app/hosted_agent_service.py`.
- Integration hooks: `backend/app/agent_models.py`, `backend/app/agent_schemas.py`,
  `backend/app/api/__init__.py`, `backend/app/api/health.py`,
  `backend/app/config.py`, `backend/app/database.py`,
  `backend/app/service_domains/agents.py`, `backend/app/service_domains/base.py`,
  `backend/app/worker.py`.
- Migration: `backend/migrations/env.py`,
  `backend/migrations/versions/ab3d5e7f9012_hosted_agent_tasks.py`.
- Tests: `tests/test_hosted_agents.py`, `tests/test_hosted_model.py`, hosted additions
  to `tests/test_agent_postgres.py` and `tests/test_platform_migrations.py`.
- Contract/operations: `docs/architecture/hosted-agent-api.md`,
  `docs/deployment/hosted-agent-service.md`, `finish-result.md`.

No experience, Docker, deployment configuration or unrelated root test edits in
this finish phase. Other snapshot changes predate this work and were retained.

## Actual verification

Interpreter: `/Users/udo/Desktop/iCloud Drive Local/Desktop/projects/lenslayer/.venv/bin/python`;
original environment was not modified. PostgreSQL 17.11 used a newly initialized
disposable local UTF8 database, Unix socket only, with per-test UUID schemas and
explicit `LENSLAYER_TEST_POSTGRES_ACK=create_disposable_schema` opt-in.
All test schemas were removed and the owned test server was stopped afterward.
Re-running PostgreSQL checks also requires `LENSLAYER_TEST_POSTGRES_URL` pointing
to an authorized local disposable database; no production URL was used.

| Check | Result |
| --- | --- |
| `-m unittest tests.test_hosted_agents tests.test_hosted_model tests.test_agent_postgres.PostgresHostedTests tests.test_platform_migrations -q` | **51 passed**, no skips; 27 SQLite/adapter, 22 hosted PostgreSQL, 2 migration checks |
| Full unittest module loader over every `tests/test_*.py` | **220 passed**, PostgreSQL enabled, no skips |
| `-m pytest tests -q` | **222 passed**, **74 subtests passed**, no skips; 78.80 seconds |
| `git diff --check` | Passed |

Coverage includes fresh-interpreter persisted restart with the same run/evidence/
proposal/approved hash; concurrent create/claims on both databases; stale initial
and final lease fences; transactional proposal rollback; immutable request/run/
delegation bindings; bounded attempts and non-spinning waits; human role/tenant
denial; cancellation/revocation/deadlines/source loss; post-model authority/source/
deadline/lease rechecks; deterministic and model injection defenses; disabled model;
durable precharge without open HTTP transactions; ambiguous/crashed calls never
retried; input resume/decline without extra model calls; exact task/Calendar/composite
approvals and verified receipts; and agent-only worker isolation/lane health.
Migration checks cover historical owner/lane defaults, hosted-key uniqueness,
legacy data/constraints, hosted-only and full downgrade/re-upgrade, and zero drift.
Only provider HTTP is fake; planner, database, human API and original ledgers are real.
One existing Starlette/httpx deprecation warning remains.

## Contract clarifications and remaining gates

- Request/response fields match the finish contract; no browser agent credential.
  The inherited
  Calendar schema accepts omitted `type` as the fixed `calendar_event_created`
  default and enforces a positive interval of at most 31 days; documented explicitly.
- Optional model mode is exactly `gpt-6.1-sol` / `high`, separately configured,
  decision-only (`proceed | needs_input | decline`), never action synthesis or a
  permission grant. It shares at most 1,000 retained excerpt characters after UI
  disclosure. No access means explicit 503; deterministic mode remains usable.
- Terminal status observes existing verified ledger outcomes asynchronously;
  cancellation does not roll back already dispatched Calendar effects. Unknown/
  partial effects and one-hour approval windows retain the original action policy.
- Dedicated command: `python -m backend.app.worker --agents-only`. It never builds
  document workflows or processes document/email maintenance. Health excludes fresh
  document-only heartbeats. Settings and migration order are in the operations doc.
- **Still pending, not claimed:** separately authorized product-model access/live
  model compatibility proof, real Calendar OAuth/provider sandbox roundtrip, and
  staging OIDC/continuous-worker/deployment proof. Coordinator owns staging
  preparation and migration/environment integration; no deployment was performed.
  No live/model calls, real `.env` inspection, publication, subscription/account
  changes, original checkout writes, dependency installation or subagents occurred.
