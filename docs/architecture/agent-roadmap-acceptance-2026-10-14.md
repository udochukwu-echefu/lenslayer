# Agent infrastructure acceptance — 14 October 2026

The roadmap implementation is integrated on `codex/agent-roadmap-completion`,
based on main `0674a45122855ce1c7c65cd4f35c91c8f1fee75f`. Source verification and
external release acceptance are recorded separately below. This is not a claim
that the new source is already running in production.

## The five tracks

| Track | Implemented and verified in source | External acceptance still required |
| --- | --- | --- |
| Production execution and operations | Private request-driven worker, bounded drain, scoped wake/recovery, metadata-only observations, immutable-image release plan and deployment guard | Backup/restore exercise, exact source image, staging acceptance, reviewed promotion, final worker-only invoker grant and queue activation |
| Developer SDK and MCP | SDK-only MIT license, 18-file ESM/types artifact, reviewed-byte OIDC release workflow, scoped context/graph SDK and MCP interfaces; actual OpenCode legacy reads/tenant denial/revocation against a disposable API | Canonical main release review, npm bootstrap/trusted publisher/publication, registry signatures/provenance, staged host acceptance and auto-protocol compatibility |
| Calendar | Session-bound one-use OAuth relay, encrypted grants, stable event identity, refresh/revocation handling and disposable live acceptance harness | Real owner consent, empty owned secondary calendar, one private event and independent read-back, refresh/disconnect/reconnect, real OIDC/browser session checks |
| Optional product model | Explicit provider/model/effort disclosure, fixed DeepSeek Responses adapter, immutable facts, durable zero-default lifetime admission gate | One bounded staged product canary and browser disclosure/consent check; production remains model-disabled |
| Broader agent workflows | Private versioned context, scoped lexical retrieval with original offsets, context-backed typed task tool, dependency/conditional/not-before graphs, SDK/MCP/example/UI | Deployed private context/graph end-to-end checks, replay/revocation/retention and narrow-screen browser checks |

Graph support is deliberately bounded to 1–20 context-backed follow-up nodes,
explicit approved targets and stable receipts. It does not provide arbitrary code
execution, recurring workflows, mixed Calendar/document graphs, automatic approval
renewal, or a general autonomous planner. Context search uses lexical AND terms;
large-workspace indexing, organization storage quotas and load qualification are
future work. These limits must remain visible in product and developer docs.

## Verification completed

All checks used disposable synthetic data. The clean source copy omitted real
environment files; no development subscription credentials were used by product
code.

- Backend discovery: **396 tests, OK, 142 PostgreSQL checks skipped** in this run;
  the remaining **254 passed**.
- Separate real local PostgreSQL 17.11 run: **142 passed**, including migration
  drift, graph dependencies, strict predicates, receipt binding, lease recovery,
  Calendar session proofs and concurrent lifetime-budget admission.
- SDK: **47 passed**, including the actual 18-file MIT tarball, offline consumer
  install, ESM imports and TypeScript declarations.
- MCP: **7 passed** through the official client and spawned stdio adapter.
  Examples: **15 passed** against disposable/fake integrations.
- Hosted planner: **23 passed**, including rejecting incompatible context-task
  input on restart without replanning or duplicating an effect. The combined
  disposable HTTP/worker integration passed document and fake-provider Calendar
  workflows, exact human approval, replay, restart and uncertain-outcome readback.
- Dashboard: **243 passed across 37 files**; lint, Next 16.4.1 build, OpenNext
  staging build and Wrangler staging dry run passed. No deployment is implied.
- Production dependency audit: **zero vulnerabilities** after compatible updates.
  The unpatched `braces` development dependency remains in lint tooling; the
  all-dependency audit is not claimed clean.

On 15 October, actual OpenCode **2.0.18** legacy-protocol tool traces proved a
successful delegated run read, a different-tenant `http_404`, and a same-host
`http_401` after owner revocation. These used the real disposable API with
synthetic data, not live staging, and no worker or funded product model ran.
Model/helpers were pinned to GPT 6.1 Sol high; Astra was not used. The private
loopback host was stopped and its port closed. A cold standalone catalog remains
empty until native same-host runtime activation. Auto protocol connected but
produced no tool trace, so its compatibility is not claimed.

[Draft PR #5](https://github.com/udochukwu-echefu/lenslayer/pull/5) contains the
integrated implementation. CI exposed and received fixes for the hosted planner
union, trusted Calendar fixture proofs, and a cross-language dashboard test's
local-only Python path. The complete GitHub workflow is **green** for source
`27311a610ebb730acb77a426bdf34ac5963cc13a`:
[run 38654924859](https://github.com/udochukwu-echefu/lenslayer/actions/runs/38654924859).
Cloud Build `d699950f-f710-483f-9b68-6acfdffffbea` built that exact Git archive into
staging digest `sha256:aea8b8f82bfbfe325bb00f66affa206061a58fc06e35f6bb0f0acb8d0d2cc6fa`.
The archive omitted local secrets and the user's untracked video document.

## Paid model evidence and remaining budget

The [live DeepSeek evaluation](deepseek-live-evaluation-2026-10-14.md) completed
ten synthetic requests with **10/10 passing**. Conservative reported token cost
was **US$0.0059391**, which is not a provider invoice. The nonrefundable admission
reservation is **US$3.1678476** of the aggregate **US$5** authorization, leaving
**US$1.8321524**. The frozen adapter/evaluator source hashes match the integrated
source.

One product canary reserves **US$0.319488**, leaving **US$1.5126644** afterward.
No product canary has been sent. Never rerun the suite with a new US$5 allowance,
refund a reservation or retry an unknown charged request. The product admission
gate defaults to zero and supports at most one lifetime DeepSeek request across
organizations, workers and restarts. The spent record survives tenant deletion
and migration rollback. Production must remain model-disabled.

## Infrastructure state

- Production queue `lenslayer-agent-work` remains **paused**. The runtime's
  queue-only Enqueuer and wake-service-account-only Service Account User grants
  were approved, applied and verified. The approved worker-only Invoker grant
  awaits creation of the private production worker resource. No production
  database migration or traffic promotion has occurred.
- Existing staging API/worker remain on the prior deployment, with the agent
  queue and recovery schedule paused and the continuous pool at zero. New source
  must be deployed and accepted before promotion.
- Staging recovery branch `br-muddy-hill-b2u9np34`, named
  `pre-roadmap-f3644b20-20261014`, was created in the staging Neon project only.
  Its compute was visibly **SUSPENDED** on 15 October. It expires at
  **16 October 2026 00:00:52 Africa/Lagos**; branch creation is not a completed
  restore exercise or a production recovery point.
- The explicitly approved `lenslayer-calendar-sandbox` project is **ACTIVE**
  (project number `602675316360`), and only the Calendar API was enabled. No
  compute or billing upgrade was created. Testing-mode OAuth branding is complete;
  a web client is prepared with the staging callback and AI-agent declaration.
  Two empty staging credential secret containers and blank entry forms are ready
  for the user's credential handoff. OAuth credentials and real acceptance are
  still pending. An independent inspector must use a different OAuth project
  because Google's revocation affects all grants within the product project.
- The approved operations email channel and **ten enabled policies** (five each
  for staging and production) were created and read back. They cover worker HTTP
  failures, ledger attention, failed hourly recovery, lost post-commit wakes and
  unsuccessful queue deliveries. Notifications contain fixed operational
  metadata, not document or task content. The single approved synthetic test log
  has been dispatched; incident/inbox delivery must be recorded before claiming
  email acceptance.
- The free **`@lenslayer` npm organization was created**, with signed-in
  `udochukwuchibueze` verified as its sole owner/member and zero packages. Its
  member page shows two-factor authentication disabled. Owner MFA, canonical
  artifact review, package bootstrap and the trusted publisher remain release
  gates. No SDK package has been published, and no GitHub release environment
  has yet been configured or verified.

## Release order

1. Push the source review PR and build a staging image from that exact archived
   commit, not a dirty working directory.
2. Back up and migrate staging, deploy the private worker/API and the dashboard,
   verify real OIDC/session behavior and context/graph execution, then recheck
   idle behavior. Keep optional model and Calendar disabled until their checks
   are ready.
3. Complete the one bounded staged model canary and real disposable Calendar
   acceptance. Provider uncertainty remains GET-only reconciliation; never replay
   a Calendar POST or silently expand OAuth scope.
4. After staging review, merge the source PR, build the exact merged source,
   and verify a production recovery point/restore exercise and release plan.
   Apply the final already-approved scoped invoker grant, accept the private
   production revision, then promote traffic and activate wake/recovery.
5. Generate and review the canonical SDK artifact on main; configure the
   package-scoped publisher and owner release gate; publish exactly the reviewed
   bytes and independently verify registry signatures and provenance.

Keep queues paused if any required acceptance fails. Deployed workers must use
request-based CPU billing, service and revision minimum zero, maximum one,
concurrency one and a bounded drain. A recurring empty polling process is not an
acceptable workaround for a missed wake or host integration failure.
