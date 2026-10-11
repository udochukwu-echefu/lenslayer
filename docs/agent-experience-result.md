# Developer/product track result — 8 October 2026

Coordinator follow-up: this is the isolated agent's handoff record. The two
tracks are now combined; the coordinator added Calendar consent/return UI and
independent API/worker/browser checks. Current results and remaining gates are
in [integration verification](architecture/agent-pivot-integration-verification.md).

Implemented locally in the isolated experience snapshot. Uncommitted, unpublished,
undeployed. No real environment secrets, provider writes, paid model calls or
subscription changes were used. No backend/root Python tests or coordinator-owned
architecture files were edited. Existing landing edits/assets were preserved.

## Delivered capabilities

- **SDK:** dependency-free ESM 0.1.0, declaration exports, build-on-pack and
  pre-publish checks. Tarball allowlist excludes tests/source fixtures/env data;
  installed ESM/type smoke passes. `UNLICENSED`/rights-holder approval gate is
  explicit because the repository did not grant an open-source distribution
  license. Not available on npm from this work.
- **MCP:** official pinned SDK 2.3.1 local stdio server, typed delegated discovery,
  fresh grants for each call, exact bearer ledger routes, metadata stderr, bounded
  calls/output/polling and safe failures. Legacy initialize and July 2026 discovery
  are handled by the official protocol implementation. No self-approval,
  reconciliation/OAuth tool, arbitrary code or direct executor.
- **Planner:** runnable task-only TypeScript CLI, injectable typed planner, real
  opt-in Responses adapter using explicit `gpt-6.1-sol`/high effort and no fallback.
  Strict plan/config constraints, fixed action text, explicit dates/assignee,
  one-action/evidence budget, bounded time/output/model calls and durable pre-call
  budget charging. Source/tool output is data, not permission. Atomic private
  checkpoints contain allowlisted IDs/counters/config hash, not credentials or
  excerpts. Restart observes/reuses the original action/evidence before planning.
  Ambiguous evidence creation stops instead of issuing a second non-idempotent POST.
- **Positioning:** landing now leads with retained context, scoped permission,
  durable execution and a verified task receipt, with real `/developers` and
  `/runs` CTAs. Existing workspace capture is labeled as synthetic document UI,
  not a live agent run; task examples are synthetic. The established visual system
  and assets were retained, not replaced by a new template.
- **Onboarding:** public dashboard `/developers` guide covers retain → scope →
  server client/MCP → human review → verified task, local package installation,
  errors and release boundaries. It is readable while signed out/loading/error;
  guidance respects private workspace role/demo permissions and has no token-entry
  or caching surface.
- **Additive platform integration:** SDK methods `createWorkflow`,
  `proposeToolAction`, `requestInput`, `inputRequests`, `supplyInput`, calendar
  targets/conditions, named composites, awaiting-input and unknown-action statuses
  match the coordinator-provided interface. MCP adds only documented generalized/
  input routes; task/calendar schema exposure follows actual delegation.
- **Operator:** calendar-only credential scopes, exact target/summary/interval/
  provenance displays and event-specific approve/reject labels; named composite
  conditions and partial progress; unknown/malformed tools never treated as tasks
  or approved with undefined fields. Typed human input supply is distinct from
  approval. History is fetched on every run detail (poll only while waiting,
  bounded by deadline/access/demo state), refreshed on supply/status/manual refresh,
  and retained on fresh terminal pages. One immutable action reserves each named
  condition; changed proposed fields require a new authorized run. Unknown/partial
  effects have explicit warnings and owner/admin-only read-back reconciliation,
  without implying rollback, another insert or reopening a terminal run.

## Actual validation results

| Check | Result |
| --- | --- |
| `npm --prefix sdk run release:check` | 33 tests pass; dry-run and 18-file tarball allowlist/credential-pattern scan, installed ESM exports and installed declarations pass |
| `npm --prefix examples/agents test` | 14 tests pass |
| `npm --prefix mcp test` | 4 official-client wire tests pass; actual stdio + injected HTTP ledger, modern discovery, calendar-only/schema/route checks, mixed conditions/input lifecycle |
| `npm --prefix hosted-agent test` | 22 deterministic evaluations pass, including adapter via fake fetch, malicious inputs/budgets, approval, safe restart and task-only guard |
| `npm --prefix dashboard run lint` | Pass |
| `npm --prefix dashboard test` | 23 files / 129 tests pass |
| `npm --prefix dashboard run build` | Pass; `/developers`, `/agents`, `/runs` and `/runs/[runId]` built/type-checked |
| `npm --prefix landing run check` | ESLint pass (`lint` is not that package's script) |
| `npm --prefix landing run build` | Vite production build pass |
| `git diff --check` | Pass |
| Browser/visual/accessibility QA | **Not run**; no browser pass is claimed |

Disposable checks executed against loopback port 8108 using sanitized `env -i`,
the snapshot source path, the provided read-only original Python interpreter and
`examples/agents/.local-check` for SQLite/object/checkpoint data:

1. `examples/agents/tests/verify-local-backend.mjs`: real retained TXT upload,
   stub extraction/analyzer, SDK evidence/action, zero tasks before human approval,
   actual worker/database read-back, exact fields/provenance, stable-key replay,
   event pagination, revocation and runnable example/restart all **passed**.
2. `mcp/tests/local-backend-smoke.mjs`: official client → actual stdio initialize/
   listTools/callTool → existing API → awaiting approval → real human approval →
   actual worker → verified task, replay without duplicate **passed**. Injected
   typed planner → same API/worker → human approval → verified task, on-disk
   restart reusing original action/evidence with one planning call **passed**.

Only analyzer/model choice is injected in these integration checks; API, SQLite,
source storage, human approval and worker execution are real disposable paths.
The fixture's app import is patched with disposable settings to prevent implicit
dotenv loading. Generated data is ignored, not a release artifact. These checks
exercise **original v1 task routes**, not the separate additive platform backend.
The disposable API process was shut down cleanly after verification; no test
server is left running on port 8108.

## Changed developer/product paths

Tracked files changed plus new source/docs/config files (generated `dist`,
`node_modules`, `.next` and disposable data are excluded):

- `sdk/`: `package.json`, `package-lock.json`, `README.md`, `LICENSE`,
  `CHANGELOG.md`, `src/types.ts`, `src/client.ts`,
  `tests/additive.test.mjs`, `tests/package-check.mjs`.
- `mcp/`: `.gitignore`, `package.json`, `package-lock.json`, `tsconfig.json`,
  `README.md`, `client-config.example.json`, `src/server.ts`, `src/schemas.ts`,
  `src/stdio.ts`, `tests/wire.test.mjs`, `tests/local-backend-smoke.mjs`.
- `hosted-agent/`: `.gitignore`, `.env.example`, `package.json`,
  `package-lock.json`, `tsconfig.json`, `README.md`, `config.example.json`,
  `src/contracts.ts`, `src/model.ts`, `src/runner.ts`, `src/checkpoint.ts`,
  `src/cli.ts`, `tests/evaluations.test.mjs`.
- `examples/agents/`: `.gitignore`, `tests/local_backend.py`.
- `dashboard/src/app/`: `layout.tsx`, `developers/page.tsx`.
- `dashboard/src/components/`: `app-shell.tsx`, `ui/status-badge.tsx`.
- `dashboard/src/components/agents/`: `action-review.tsx`,
  `agent-create-form.tsx`, `agent-registry.tsx`, `agent-registry.test.tsx`,
  `run-detail.tsx`, `run-detail.test.tsx`, `run-list.tsx`, `run-list.test.tsx`,
  `developer-guide.tsx`, `developer-guide.css`, `developer-guide.test.tsx`,
  `success-condition.tsx`, `calendar-review.test.tsx`, `run-input-requests.tsx`,
  `run-input-requests.test.tsx`.
- `dashboard/src/lib/`: `agent-types.ts`, `agent-shapes.ts`, `agent-state.ts`,
  `agent-state.test.ts`, `agent-demo-data.ts`, `agent-api.test.ts`, `api/agents.ts`;
  `dashboard/src/test/agent-fixtures.ts`.
- `landing/`: `index.html`, `src/App.jsx`, `src/index.css`,
  `src/components/landing/faq-section.jsx`, `portfolio-demo.jsx`,
  `workflow-cards.jsx`.
- `docs/`: `developer-agent-quickstart.md`, `developer-release-checklist.md`,
  `agent-experience-result.md`.

`AGENTS.md`, `opencode.jsonc` and
`docs/architecture/agent-interface-changes.md` are coordinator-provided files,
not experience-authored deliverables. No commit/stage/reset/publication occurred.

## Seams and external setup still needed

1. Merge the platform implementation before running additive real-backend tests.
   Exact contract was read from the coordinator document and read-only platform
   schemas/routes; experience edits do not implement or test platform code.
2. Google Calendar grants need provider credentials/encryption, owned-calendar
   consent, exact redirect URI and authenticated same-human callback. The current
   Agents form accepts a pre-existing connection/calendar pair. Consent/callback
   UI, callback query/log suppression and live provider verification are missing
   integration/release steps; generic metadata creation is not calendar OAuth.
3. SDK rights/license approval, npm scope ownership, repository/release metadata,
   CI trusted publisher/provenance and authorized publication remain external.
4. Private browser runs require existing OIDC/session configuration. Local human
   headers do not create a browser session; public demo records remain synthetic.
5. MCP needs an actual local host configuration/secret delivery. There is no
   deployed/remote MCP endpoint or OAuth service.
6. Planner requires separate product API credential and explicit opt-in. Real-model
   quality/adversarial evaluations, costs/latency and data-processing/retention
   review were not run. Model existence is verified upstream; no model-access or
   quality claim follows. Task-only CLI is not a hosted service or calendar planner.
7. Staging PostgreSQL/worker leases, OIDC, concurrency/load and live provider
   round-trips remain release gates. No delete/compensation API exists.

## Design notes and coordinator browser QA

Applied the requested taste skill and its quality/copy/layout guidance as a
**targeted repositioning**: kept the current fonts, color palette, spacing,
section rhythm, round CTA/arrow assets, capture and visual effects. Changed
hierarchy/copy so contracts are a first grounded example rather than a broad
unsupported connector promise. Preserved mobile navigation/Escape/focus behavior
and reduced-motion handling. These are source-level changes, **not visual QA**.

Use 1440×900, 390×844 and 320px width, keyboard-only and reduced-motion settings:

- Landing `/`: hero/workflow/control/FAQ/closing, capture caption, synthetic task
  illustrations, developer/sample/sign-in/converter CTAs; mobile menu links,
  Escape and focus return; long new copy and animation opt-out. For local routing,
  set `VITE_APP_URL` to the local dashboard before build/dev.
- Dashboard `/developers`: signed-out synthetic, owner/admin, reviewer/viewer,
  loading and workspace-error guidance; anchors, code overflow, routes and no
  token-entry surface. `/agents`: task and calendar-only create forms, required
  approval default, long exact IDs, expiry/error, one-time credential dismissal,
  role/workspace/page-hidden clearing and revocation.
- `/runs`: empty/loading/error, private records vs synthetic demo.
  `/runs/[runId]`: task approval, calendar approval with no undefined task links,
  document-backed vs independent event, mixed named conditions, expired/terminal
  approval, unsupported/malformed tool input, viewer/demo mutation denial.
- Input states: pending human/agent responders, integer/boolean/text/date-time
  controls, credential-like field rejection, expiry, supply → running refresh,
  immutable facts after full-page terminal reload, forbidden access refresh.
- Outcome states: one composite receipt vs whole-run success, unknown outcome,
  cancellation race/partial effect, owner/admin read-back reconciliation, terminal
  run unchanged, long result JSON/IDs/aware timestamps and no fabricated event link.

The original-v1 fixture leaves non-secret `examples/agents/.local-check/ui-records.json`
for task/approval references; additive states require the merged platform fixture
or coordinator-injected API records. No real tokens are written to that reference
file. See the [release checklist](developer-release-checklist.md) for remaining gates.
