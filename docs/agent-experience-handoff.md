# OpenCode assignment: developer and product half

You are implementing the developer/product half of LensLayer's agent
infrastructure pivot. Work in this isolated snapshot, not the user's original
checkout. Use ONLY GPT-6.1 Sol at high effort. Never use Astra or another model,
spawn an agent, change model/account configuration, or delegate. The user says to
challenge wrong assumptions. Implement the authorized local work completely.

Read `docs/architecture/agent-pivot-workstreams.md`,
`docs/architecture/agent-infrastructure-direction.md`,
`docs/architecture/agent-api-v1.md`,
`docs/architecture/agent-handoff-verification.md`,
`docs/developer-agent-quickstart.md`, and the existing source/tests.

## Ownership and boundaries

Own `sdk/`, `mcp/`, `hosted-agent/`, `examples/agents/`, `dashboard/`, `landing/`,
`docs/developer-agent-quickstart.md`, and new developer/product documents.
Add `docs/agent-experience-result.md` and `docs/developer-release-checklist.md`.
Do not edit backend, Python tests, root requirements/README, architecture or
deployment docs, or the user's original checkout. Do not commit, stage, reset,
deploy, publish packages, contact anyone, purchase services, or read/copy real
.env secrets. Do not execute real provider writes or paid model calls to test
the product. Use injected fake adapters and a disposable local backend.

Existing landing edits are part of the snapshot and must be preserved. Evolve
the page's purpose and copy while retaining its visual system/assets/interactions;
do not reset it to the Git HEAD version or replace it with a generic template.

## A. MCP and SDK distribution

- Make the existing `@lenslayer/agent-sdk` package publish-ready: version,
  export surface, files, license/provenance consistency, documentation,
  `npm pack --dry-run`/tarball smoke check, release checks. Do not actually publish
  or claim it is available on npm. Preserve no runtime framework dependency and
  server-only credentials. Check package contents contain no secrets/test data.
- Implement a real MCP stdio server in `mcp/` using the official protocol SDK.
  Browse/read official MCP and package docs; pin compatible versions and follow
  the current spec rather than fabricating JSON-RPC behavior.
- Tool discovery exposes only the delegated agent's allowed capabilities. Each
  call uses the existing bearer run/evidence/action API and ledger; expose run
  creation/status/events, retained evidence, and task proposal as appropriate.
  It must never bypass scope, approve its own actions, execute arbitrary code,
  treat model text as permission, or imply an action executed just because a
  proposal was accepted. Typed schemas, metadata-only logs on stderr, bounded
  polling, and credential-safe errors are required.
- Provide local client configuration and an actual SDK-client-to-MCP smoke
  test proving initialize, listTools, callTool, approval pending, then a verified
  result from a disposable backend or injected HTTP transport. Do not advertise
  hosted MCP/remote OAuth when you only built stdio.
- Preserve safe retry/idempotency/redaction behavior and all existing SDK tests.

## B. Infrastructure positioning and onboarding

- Use the frontend design skill at
  `/Users/udo/.agents/skills/taste-skill/SKILL.md` and relevant quality/copy/layout
  references. This is a targeted repositioning of an existing page; preserve
  its established design rather than inventing a new theme.
- Lead with context, permission to act, durable execution, and proof of a
  verified outcome for developers. Contracts are the first workflow/example,
  not a false claim that general cross-system execution is already delivered.
- Replace contract-review-only hero/workflow/FAQ/closing copy and misleading
  visuals where necessary. Use existing assets only when they support current
  claims; describe an existing dashboard capture accurately. No invented logos,
  metrics, customer testimonials, supported connectors, or hosted functionality.
- Add a useful developer onboarding/docs surface in the dashboard (or a real
  linked documentation route), with the genuine sequence: retain source ->
  scope credential -> run external client -> inspect/approve -> verified task.
  Match role/demo behavior and avoid storing agent tokens in browser caches.
- Make primary CTAs navigate to real working pages. Preserve accessibility,
  mobile navigation, reduced-motion behavior, loading/error states, and current
  font/spacing/color design. No extra unrelated redesign or pricing page.

## C. Bounded hosted planner client

- Implement `hosted-agent/` as a server-side runner/client of the same agent
  API, not a direct backend/DB executor. Keep the existing FastAPI stack.
- Separate a typed/injectable planner from infrastructure execution. Provide a
  real configurable model adapter with validated structured output, but do not
  reuse OpenCode's subscription secrets or assume a product model credential.
  Real product calls are opt-in, with an explicit non-Astra model and limits.
- The initial supported goal can be the retained-document follow-up task.
  Verify explicit scope/assignee/factual dates before creating an action;
  missing data must return a structured input request, never invent values.
- Bound model iterations/calls, time, action/evidence budgets and output size.
  Validate every proposal against typed tool/success constraints. Document
  prompt-injection boundaries: retrieved text is data, not policy or instructions.
- Persist resumable state/checkpoints without plaintext bearer credentials or
  copied source excerpts. Reuse idempotency keys and original evidence/action
  on restart. Stop for human approval and terminal state; do not self-approve.
- Add deterministic evaluations covering grounded proposal, unsupported goal,
  missing input, malicious source/tool output, budget exhaustion, invalid planner
  output, model failures, human approval, and safe restart without duplicate
  tasks. Explain what is evaluated versus what requires a real model.
- Provide an actual runnable CLI/service entrypoint, config example, and setup
  guide. Do not claim hosted deployment or arbitrary autonomous task execution.

The backend track is extending schemas additively. Build initially against the
current v1 API. If `docs/architecture/agent-interface-changes.md` becomes available,
use it; otherwise explicitly document the integration seam. Do not invent routes
or edit backend to make them exist. The coordinator resolves cross-track types
and dashboard support after both sets of changes are available.

## Validation and result

Run dashboard lint/tests/build, landing lint/build, all SDK/example tests, MCP
wire smoke tests, planner evaluations, and package checks. Do not claim passing
browser QA if no browser was available; leave precise routes/states for the
coordinator to inspect at desktop/mobile sizes. Add tests for real protocol,
credential or state boundaries; skip mirror tests for simple copy edits.

`docs/agent-experience-result.md` must list files changed, actual checks/results,
implemented capabilities, integration seams, and missing external setup.
`docs/developer-release-checklist.md` must cover final npm/staging/provider/model
release steps without claiming those steps ran. Final answer must be factual.
