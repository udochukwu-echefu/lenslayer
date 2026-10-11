# Combined agent infrastructure verification

Historical developer-pilot record. The later hosted service, assignment UI and
staging preparation are recorded in [finish verification](agent-pivot-finish-verification.md),
which is the current combined status. The 385-test count below belongs to the
earlier phase; the final combined count is 493.

Completed 9 October 2026, following the two implementation tracks assigned on
8 October. The bounded developer pilot is implemented and locally verified.
This is source and local execution evidence; no deployment, npm publication,
live Google consent/write or real-model evaluation was performed.

## Delivered

- Scoped agent identities and resource grants; a closed typed/versioned registry
  for document retrieval, internal task creation and owned-Calendar event creation.
- Immutable approvals, fenced worker leases, stable provider event IDs, exact
  read-back receipts, partial-effect reporting and bounded GET-only recovery.
- Up to 20 named `all` task/event conditions with durable completion checkpoints;
  strict immutable human/agent factual input requests and attribution.
- Encrypted Calendar OAuth credentials, single-use same-human consent, Settings
  setup and `/calendar/oauth-return`, disconnect and pending revocation handling.
- Packable server-side TypeScript SDK, official local stdio MCP adapter, bounded
  task-planner CLI, public developer guide and expanded Agents/Runs operator views.
- Agent infrastructure positioning that preserves the existing landing design
  and clearly labels synthetic examples and the first task workflow.
- Repeatable disposable HTTP integration runner and CI definitions covering
  client packages, planner, API/worker flows and explicit PostgreSQL opt-in.

## Independent checks

There are **385 passing tests** across these suites; repeated focused runs are
not added to that count. The planner uses injected models and Google HTTP is fake.

| Check | Actual result |
| --- | --- |
| Python discovery with disposable PostgreSQL 17 enabled | 171 passed, including 56 PostgreSQL checks, no skips |
| SQLite/PostgreSQL migrations | Additive upgrade/downgrade/upgrade, preserved constraints/data and full metadata drift checks passed |
| SDK release check | 33 tests; 18-file packed-artifact allowlist/credential-pattern checks, installed ESM and TypeScript declarations passed |
| Official MCP client wire tests | 4 passed, including actual stdio and delegated task/calendar/input schemas |
| Bounded planner evaluations | 22 passed; budgets, grounding, hostile inputs, approval/restart and fake model-adapter transport |
| External example | 14 passed |
| Dashboard | 141 passed in 24 files, including 12 Calendar consent boundary tests; lint passed |
| Dashboard production compilation | Default Next.js Turbopack and webpack builds passed with the reviewed source |
| Landing | ESLint `check` and Vite production build passed |
| Existing report evaluation | Deterministic synthetic quality gate passed |
| CI and runner | Workflow YAML parsed; Python fixtures/runner compiled; runner completed all real local HTTP checks and removed its own data/processes |

The temporary combined directory reused dependencies through symlinks, which
Turbopack rejects across its root. The default compiler was therefore run in the
dependency-complete isolated experience directory after copying the final reviewed
dashboard sources. Local compiler socket/subprocess permissions were required.
No production compiler configuration workaround was merged. GitHub Actions itself
has not been run; adding its definitions is not a claim of a green hosted run.

## Real API and worker flows

`make check-agent-integration` runs these against new private temporary databases
and nonce-verified loopback fixture processes. It loads no real `.env`, calls no
real provider/model and sends no email. The API, source storage, approvals,
database, worker processes, SDK and MCP stdio transport are real local components.

1. Retained TXT upload → evidence retrieval → immutable task proposal → human
   approval → worker → exact database receipt, stable replay, pagination/revocation.
2. Runnable external example executes and restarts without a duplicate task.
3. Official MCP initialize/discovery/call → real API → approval → actual worker
   → verified task, including repeat proposal and event reads.
4. Injected task planner → approval → worker verification → disk restart with
   original action/evidence and one model call, no extra task or replanning.
5. Calendar-only SDK/MCP with no document scope → typed human input → exact event
   approval → worker/fake HTTP GET receipt; replay results in one insert.
6. Document-backed task/event composite → verified task checkpoint → typed agent
   input → separate worker process → both named receipts required for success.
7. Provider insert followed by unreadable GET → unknown outcome → human bounded
   GET-only reconciliation → partial-effect receipt; terminal run remains failed
   and no second insert occurs.

Backend tests additionally cover scope/tenant boundaries, expiry, typed input
replay/conflicts, revoked/changed grants, lease races, cancelled-run fencing,
malformed provider data and legacy task hash/approval compatibility.

## Review corrections

- New default fields preserve old v1 action hashes, replay and approval binding.
- Calendar-only goals require no retained document or assignee.
- Malformed provider responses and timezone-free dates fail closed.
- Read failure **before** the dispatch marker is a definite non-write; uncertainty
  applies only after the marker, which can never be cleared for another POST.
- Input history loads on every run, refreshes on supply/terminal changes and keeps
  factual supply distinct from human approval.
- Calendar callback scrubs query/hash before workspace loading, exchanges once on
  an explicit initiating-human click, and keeps code/state out of storage/caches.
  Workspace/user/role changes abort pending consent requests and late redirects.
  Disconnect distinguishes local blocking from pending provider revocation.
- Verification processes prove their fixture identity before any writes. CI now
  includes new client suites and a loopback-only disposable PostgreSQL service.

## Browser checks and limits

The public landing/developer guide were inspected at desktop and narrow mobile
widths; synthetic run details/immutable JSON at 390px and 320px had no document
overflow. Landing assets loaded, guide/sample navigation worked, synthetic labels
remained visible, and no approval/cancel/supply controls appeared in the demo.
SDK disclosure keyboard activation and navigation Escape/focus were checked.
The callback cleared synthetic code/state query parameters and offered restart
when initiating metadata/session was absent. The final callback HTTP response returned `Referrer-Policy: no-referrer` and `Cache-Control: private, no-store` (200).

Private Calendar/mixed/input/unknown-effect UI behavior is covered by local
component/API tests, not a live private-browser session. Complete staging OIDC,
full keyboard/reduced-motion and accessibility checks before release. Hosting
query-log suppression is separate from browser URL clearing/no-referrer headers.

## Remaining release and product work

1. Apply migrations and supervise API/worker on designated staging with PostgreSQL,
   private storage and real OIDC; verify concurrency/restarts, metrics and alerting.
2. Configure a Google sandbox OAuth client, exact dashboard return URI and secrets;
   suppress callback query logs and verify same-human live consent, one approved
   disposable event, GET read-back, refresh and disconnect/revocation recovery.
3. Finish authorized npm scope/license/provenance/release setup and publication;
   configure an actual MCP host with scoped server-side credential delivery.
4. Evaluate the real model with separate product API access and approved source
   handling. The OpenCode ChatGPT subscriptions were used only for development.
5. This phase originally left the user-facing service unimplemented. The
   [finish phase](agent-pivot-finish-verification.md) now implements the Python
   hosted service and assignment UI for document, Calendar and combined goals.
   Deployment remains open. The TypeScript CLI keeps private file checkpoints;
   broader goal types, general DAGs, arbitrary tool extensibility and additional
   live connectors remain subsequent product work.

See [release checklist](../developer-release-checklist.md),
[developer quickstart](../developer-agent-quickstart.md), and
[worker/Calendar operations](../deployment/agent-worker-operations.md) for exact
setup and commands. The isolated [platform](agent-platform-result.md) and
[experience](../agent-experience-result.md) handoff reports are historical records;
this document describes the combined result.

## Coordination

Both OpenCode implementation sessions used `openai/gpt-6.1-sol#high`; Astra and
fallback/subagent models were disabled. The second saved ChatGPT account was
reserved for the five-hour quota boundary; no quota switch was triggered.
Only reviewed deltas were integrated after comparing original-file hashes with
the starting snapshot. Original uncommitted work was preserved. No staging,
reset, commit, publication or deployment was performed.
