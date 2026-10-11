# Remaining agent infrastructure work: two implementation tracks

Assigned on 8 October 2026. Both OpenCode sessions must use
`openai/gpt-6.1-sol#high`. Astra is prohibited, including fallbacks and subagents.
The coordinating Codex agent reviews, integrates, and verifies both results.

Running OpenCode sessions:

- Platform: `ses_ee2b7eaa4ffeFyHerjRmwGnrfV`, in
  `/private/tmp/lenslayer-pivot-qvfsf4lf/platform`.
- Experience: `ses_ee2b7de62ffeBTEMctGLM4JSao`, in
  `/private/tmp/lenslayer-pivot-qvfsf4lf/experience`.

Both session records confirm model `gpt-6.1-sol`, provider `openai`, variant
`high`. Local configuration also pins internal summary/compaction agents to
that model, disables Astra entries, disables further delegation, and disables
the unrelated cloud MCP integration. These isolated copies include the current
uncommitted implementation and landing edits, without real environment files.

Account policy: use the existing active saved account (`OpenAI 2`). If its
five-hour subscription limit is reached, switch to the other saved account
(`OpenAI`) and resume the same sessions with the same model. Do not purchase
credits, upgrade accounts, or switch merely for a transient transport error.

## Scope and ownership

| Track | Three milestones | Owned files |
| --- | --- | --- |
| Platform | Production reliability; one real connector implementation; generalized durable task workflows | `backend/`, Python `tests/`, root `requirements.txt`, backend/deployment/architecture documentation |
| Experience | MCP/SDK distribution; infrastructure positioning and onboarding; bounded hosted planner client | `sdk/`, `mcp/`, `hosted-agent/`, `examples/agents/`, `dashboard/`, `landing/`, developer/product documentation |

Each session starts from a copy of the current uncommitted checkout. Agents work
in separate directories. They do not deploy, publish, reset the original checkout,
change subscriptions, or spawn other models. The coordinator integrates only
reviewed, owned file changes and preserves the original edits.

The platform track is larger in engineering effort. Splitting by file ownership
reduces integration conflicts; this is not a claim of equal difficulty. The
experience track can build MCP and a planner against the existing v1 API while
the platform track adds backwards-compatible capabilities.

## Shared contract

- Preserve the verified v1 retained evidence -> immutable approval -> internal
  task workflow and the separation between human and agent credentials.
- Keep FastAPI/SQLAlchemy/Alembic and the existing worker. No stack replacement.
- Extend API contracts additively. The platform track owns the final schemas and
  writes an explicit interface change log for the experience track.
- External provider execution must persist intent before the network call and
  reconcile uncertain outcomes. A database rollback cannot undo a provider write.
- A hosted planner is a client of the same scoped agent APIs. It cannot directly
  write database tasks or approve its own actions.
- Product claims must distinguish local implementation, fake-provider tests,
  and a verified live-provider round trip.

## Milestones

Platform first generalizes tool dispatch and completion checks, then adds a
Google Calendar event connector as the first bounded cross-system workflow, and
adds production checks/operations. Choose a smaller coherent implementation if
full generalization would destabilize v1; explicitly report the remaining gap.

Experience prepares npm packages without publishing, adds a real MCP stdio
adapter, changes the product messaging/onboarding, and implements a bounded
model-driven runner. The initial planner may support the existing internal task
goal; unsupported goals must fail clearly. Any missing-input flow uses explicit
structured input rather than invented dates or identities.

The coordinator reviews both change sets, resolves interface differences, runs
the meaningful suites and a local end-to-end integration, and records actual
results. A mock-only test does not close the live OAuth/provider milestone.

## Release validation requiring external state

Complete local code and reviewable release artifacts first. Real staging/OIDC,
provider OAuth consent and sandbox writes, and npm publication remain distinct
release actions. Record exact commands/configuration and concrete missing setup.
No existing production credentials may be printed or copied into logs/prompts.
Do not claim these checks passed merely because an optional test was skipped.

Detailed assignments: [platform](../agent-platform-handoff.md) and
[experience](../agent-experience-handoff.md).


## Earlier developer-pilot outcome — 9 October 2026

Both implementation tracks are complete for the bounded local pilot and have
been independently reviewed and integrated. The coordinator added Calendar
Settings/return UI, real combined HTTP/worker checks, CI coverage and a guarded
repeatable integration runner. The original dirty checkout was preserved; no
reset, staging, commit, deployment or publication occurred.

- 385 tests passed, including 56 real disposable PostgreSQL checks.
- SDK packaging, MCP stdio, task-planner restart, fake-provider Calendar,
  composite/input and unknown-effect GET-only recovery all passed locally.
- Dashboard default production compiler, lint, landing build and focused public
  desktop/mobile/callback browser checks passed.
- Both OpenCode sessions used GPT-6.1 Sol high. No Astra/fallback/subagents;
  backup saved account remained available and no quota switch was triggered.
- Live staging/OIDC/provider/model verification, npm release and a deployed
  user-facing agent service remain open. The planner is still a task-only CLI;
  arbitrary goals/tools/general DAGs are not implemented.

See [combined verification](agent-pivot-integration-verification.md) and the
[release checklist](../developer-release-checklist.md) for actual evidence and
remaining work. The two isolated result files are historical handoffs.

## Hosted service finish — 9 October 2026

The follow-up phase implements the Python hosted service and assignment/status UI
for document follow-ups, Calendar-only events and combined goals. The coordinator
reviewed and merged 62 owned deltas after exact baseline/source hash comparison,
preserving original uncommitted changes. The combined 493-test result includes
78 disposable PostgreSQL checks; actual HTTP/worker flows, default dashboard and
OpenNext production builds, and staging Wrangler dry-run passed.

Staging preparation and an exact SDK review artifact are complete. Staging
provisioning/deployment, live OIDC/Calendar/model acceptance and authorized npm
publication remain external release steps. Broader goals/tools/general DAGs are
future product work. See [current finish verification](agent-pivot-finish-verification.md)
and [staging review](../deployment/agent-staging-review.md).
