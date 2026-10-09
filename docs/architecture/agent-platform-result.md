# Platform assignment result — 8 October 2026

Coordinator follow-up: this is the isolated platform agent's handoff record.
Current combined checks, Calendar consent UI and remaining gates are recorded
in [integration verification](agent-pivot-integration-verification.md).

**Implemented and locally verified; not deployed or live-provider verified.**
The final full Python suite passed **171 tests**, including **56 opted-in real
PostgreSQL checks**. Original v1 task behavior remains covered. All work is in
the isolated platform snapshot, unstaged/uncommitted. No secrets were inspected,
live account/provider writes performed, services deployed, or subagents used.

## Delivered capabilities

- Closed versioned registry with typed inputs, scoped policy validation, execution
  adapters and deterministic completion checks for workspace tasks and Calendar.
  Existing retained-contract authorization is reused; external grants are exact
  organization/connection/calendar pairs with no wildcard authority.
- Additive `/agent/workflows` and `/tool-actions`, explicit named `all` conditions,
  one immutable proposal per condition, durable verified-receipt checkpoints and
  completion only after every condition passes. The v1 single-task routes remain.
- Independent Calendar goals require **no document or evidence**. Document-backed
  Calendar actions optionally require both contract/evidence IDs, retained source
  verification, scoped retrieval, and private provider provenance hashes/IDs.
- Bounded immutable structured input requests, `awaiting_input`, human/agent
  responder authorization, exact typed supply/replay, expiry and attribution.
  Supplied values cannot change an approval, success condition, deadline or scope.
- Human-admin OAuth initiation/authenticated POST callback: signed ten-minute
  state binds human/tenant/client/fixed redirect; atomic one-time consumption;
  exact owned-event scope; encrypted bound credentials isolated from connection
  metadata. Fail-closed configuration, expiry/refresh, one bounded 401 refresh,
  invalid-grant/scope failure, permanent local disconnect and explicit remote
  revocation-pending state. Reconsent creates a new connection, not wider authority.
- Stable Google event ID from action output UUID; immutable persisted intent;
  short DB transactions with no HTTP under locks; final authorization immediately
  before committed dispatch; GET-based exact provider verification; lease-fenced
  outcomes and bounded GET-only recovery after dispatch. Cancellation/revocation
  can record verified partial effects without successful run completion.
- Correct uncertainty boundary: an initial failed/malformed GET has no dispatch
  marker, makes **zero POSTs**, fails with redacted `provider_read_failed` or
  `provider_response_invalid`, and reports `dispatch_may_have_effect:false`.
  The same failure after committed dispatch is `unknown_outcome` with may-have-
  effect true. Recovery retains that marker and cannot insert again, including
  a later 404 (explicitly regression-tested). Definitive
  field conflicts/write rejections remain failures, never claimed completion.
- Provider JSON shape/date validation, timezone-naive provider-date rejection,
  fixed HTTPS endpoints, no redirects/environment proxies, bounded streaming
  response size/time, no provider bodies/tokens in API errors/ledger records.
- Durable tenant-isolated operational counters and worker heartbeat/readiness;
  continuous-worker, alerting, migration and staging acceptance instructions.
- Additive historical index repair and workflow/OAuth migrations, with actual
  SQLite/PostgreSQL metadata checks, roundtrip, duplicate rejection and preserved
  pre-extension data. Historical redundant unique constraints are preserved, not
  dropped to silence drift. Legacy task response instants normalize to UTC.
- True pre-extension request/action regression: seeds canonical old dictionaries,
  run hash and approved action row, replays v1 and new workflow requests, dispatches
  the approved task and asserts original input/hash/approved binding unchanged.
- Opt-in real Google sandbox CLI with explicit acknowledgment, dedicated owned
  secondary calendar, temporary database, hidden code input, explicit approval,
  real dispatch/read-back and disconnect. Only its guard/help paths ran here.

Exact routes/payload/status/result types are in
[agent-interface-changes.md](agent-interface-changes.md); operational commands and
release gates are in [worker operations](../deployment/agent-worker-operations.md).
SDK/MCP/dashboard/planner/landing implementation belongs to the experience track
and was not edited or verified by this platform assignment.

## Actual validation

Interpreter reused read-only from the original repository:

```sh
PY='/Users/udo/Desktop/iCloud Drive Local/Desktop/projects/lenslayer/.venv/bin/python'
"$PY" -m unittest tests.test_calendar_workflows -q
"$PY" -m unittest discover -s tests -q
```

- Connector/workflow module: **31 tests passed** in 7.024 seconds after the
  uncertainty-classification fix (30 workflow tests plus the sandbox guard).
- Full suite without PostgreSQL opt-in: **115 passed, 56 explicitly skipped**
  (`Ran 171 ... OK (skipped=56)`) in 30.712 seconds. Skips are not PostgreSQL proof.

The coordinator authorized only this empty local PostgreSQL 17 test database:

```sh
export LENSLAYER_TEST_POSTGRES_ACK=create_disposable_schema
export LENSLAYER_TEST_POSTGRES_URL='postgresql+psycopg://lenslayer_test@/lenslayer_agent_test?host=/private/tmp/lenslayer-pivot-qvfsf4lf/pgsocket&port=55442'
"$PY" -m unittest tests.test_agent_postgres tests.test_platform_migrations.PostgresPlatformMigrationTests -q
"$PY" -m unittest discover -s tests -q
```

- PostgreSQL-only selection: **56 passed, no skips**, 27.673 seconds.
- Final full opted-in selection: **171 passed, no skips**, 41.274 seconds.
- Each PostgreSQL test uses its own UUID schema with public excluded from
  search_path; teardown drops exactly that schema. Existing/live databases were
  not examined. PostgreSQL tests reuse API/worker assertions, including actual
  contention/lease recovery, immutable approvals, tenant grants, checkpoints,
  input resume, stale worker fencing and post-dispatch read-only reconciliation.
- Both migration tests execute real Alembic upgrade from base to pre-extension
  `6e8a2b4d9c10`, seed preserved tenant data, upgrade to `9a2b4c6d8e10`, run
  **`alembic.command.check`** (`No new upgrade operations detected`), compare
  metadata, downgrade to pre-extension, check uniqueness/data again, re-upgrade
  and compare again. Actual duplicate inserts are rejected before/after each
  phase for all three repaired uniqueness indexes.
- `"$PY" -m backend.app.calendar_sandbox --help`: exit 0, no consent/write.
- `git diff --check`: clean. No commit or staging operation performed.
- Existing Starlette/httpx TestClient deprecation warning remains nonfatal;
  unrelated dependency replacement was not performed.

## Changed files in this assignment

Paths below are owned additions/edits relative to the snapshot baseline, not a
claim that pre-existing uncommitted product work was authored by this track.
`AGENTS.md` and `opencode.jsonc` were already present and remain untouched.

| Area | Files |
| --- | --- |
| Typed workflow/runtime/resource/metrics | `backend/app/agent_schemas.py`, `backend/app/agent_models.py`, `backend/app/agent_tools.py`, `backend/app/agent_resources.py`, `backend/app/agent_runtime.py`, `backend/app/agent_metrics.py`, `backend/app/service_domains/agents.py` |
| Calendar implementation | `backend/app/connector_models.py`, `backend/app/calendar_connector.py`, `backend/app/calendar_runtime.py`, `backend/app/calendar_sandbox.py`, `backend/app/service_domains/calendar.py`, `backend/app/api/calendar.py` |
| Routing/service/config/import wiring | `backend/app/api/__init__.py`, `backend/app/api/agents.py`, `backend/app/api/health.py`, `backend/app/services.py`, `backend/app/config.py`, `backend/app/database.py`, `backend/app/schemas.py`, `backend/app/service_domains/integrations.py` |
| UTC, historical metadata and worker | `backend/app/service_domains/common.py`, `backend/app/service_domains/tasks.py`, `backend/app/models.py`, `backend/app/worker.py` |
| Factory/ASGI separation | `backend/app/application.py`, `backend/app/main.py` (keeps `main:app` and re-exported `create_app`; explicit factories do not instantiate default settings/.env merely to import the sandbox) |
| Migrations | `backend/migrations/env.py`, `backend/migrations/versions/8f1a3c5e7b90_historical_index_alignment.py`, `backend/migrations/versions/9a2b4c6d8e10_durable_workflows_and_calendar.py` |
| Tests | `tests/test_calendar_workflows.py`, `tests/test_agent_postgres.py`, `tests/postgres_support.py`, `tests/test_platform_migrations.py` |
| Dependencies/docs | `requirements.txt`, `backend/README.md`, `docs/architecture/agent-api-v1.md`, `docs/architecture/agent-foundation-verification.md`, this result, `docs/architecture/agent-interface-changes.md`, `docs/deployment/agent-worker-operations.md` |

The only dependency addition is `cryptography>=44,<51`; the reused interpreter
already supplied 50.0.1, so no package installation was needed. No original v1
test was weakened or removed. Migration env accepts an explicit connection for
isolated schema tests and avoids disabling other loggers during Alembic checks.

## Official Google references and assumptions

- [OAuth web-server flow, refresh and revocation](https://developers.google.com/identity/protocols/oauth2/web-server): confidential-client code flow, offline grant, fixed redirect, expiring access/refresh tokens and one-time state. Google revocation invalidates the user's project grant across that project's clients and may propagate later; local disconnect is immediately authoritative.
- [Calendar OAuth scopes](https://developers.google.com/workspace/calendar/api/auth): exactly `calendar.events.owned`, not general/shared-calendar permission. Broader scopes returned by Google are rejected.
- [events.insert](https://developers.google.com/calendar/api/v3/reference/events/insert): caller-provided IDs use base32hex characters, 5–1024 characters. `ll` + UUID hex is valid; UUID randomness reduces collisions but is not a claim that Google globally guarantees collision detection. POST requests `sendUpdates=none`; no attendees/recurrence/conferencing.
- [events.get](https://developers.google.com/calendar/api/v3/reference/events/get): GET the exact stable ID on the explicit calendar; verify target-specific private provenance and exact approved bounded fields. Equivalent aware offsets compare as UTC instants; naive values are rejected.
- [Calendar errors](https://developers.google.com/calendar/api/guides/errors): 401 refresh, 409 duplicate/conflict and transient errors. This implementation uses GET instead of blind write retries for ambiguous outcomes; a 404 after dispatch is not proof that no effect occurred.

## Remaining gaps and release gates

1. **Not established:** real OAuth consent/refresh/revocation propagation, live
   Calendar POST/GET, staging real OIDC, deployed migration/worker readiness or
   staging crash recovery. These require separately authorized disposable
   credentials/consent and a staging environment. No production readiness claim.
2. **Frontend relay required:** initiating human must relay code/state using real
   existing auth, clear the redirect URL and suppress logs. Backend API and opt-in
   CLI exist; frontend consent UX is not this track's deliverable. Stored active
   grant is not proof of selected-calendar access or a verified Google identity.
3. **Bounded workflows, not a general orchestration engine:** flat named `all`
   conditions and up to 20 actions; no nested DAG, dynamic success conditions,
   hosted planner, arbitrary tools/code, general recurrence or attendees. Exact
   target/date conditions must be known when creating a run. Missing input can
   confirm facts or complete an unproposed action's extra fields, but cannot defer
   required condition fields or mutate locked intent; a materially different goal
   requires a new authorized run.
4. **Conservative recovery:** a dispatch marker written just before a crash may
   exist even if POST never started. Recovery never clears it or re-inserts; it
   may stop uncertain even when no remote object exists. Operator reconciliation
   remains bounded GET-only, requires current authority/source/approval, and does
   not reopen terminal runs. Revoked/expired authority may require provider-side
   manual investigation. No deletion/compensation API or automatic retry backoff.
5. **Provider lifecycle limits:** no RISC/DPoP, identity discovery, push refresh-
   revocation notifications, automated key rotation or background revocation
   retries. Explicit retry-disconnect/manual account revocation and reviewed
   credential re-encryption are documented. Google project-level revocation can
   affect other grants for the same account/project.
6. **Operations:** ordinary index DDL can block large PostgreSQL tables; production
   rollout needs its own maintenance/online-index plan. Shared worker reviews may
   delay agent queues; heartbeat proves freshness only. Counters rely on retained
   ledger records rather than an independent metrics store. No live alert wiring
   or supervisor/deployment configuration was applied.
7. **Receipt semantics:** composite checkpoints prove each exact object at its
   read-back time, not continued existence. Calendar provenance carries IDs and
   hashes, never automatically exported retained source text. Caller descriptions
   can contain user-provided data; callers must avoid secrets/sensitive text.

These are explicit implementation/release boundaries, not silently completed
requirements. Run the opt-in provider/staging procedures in the operations doc
before advertising verified cross-system execution in a deployed environment.
