# LensLayer agent infrastructure direction

Status: bounded developer infrastructure and the user-assigned hosted service
implemented and locally verified, 9 October 2026. Staging is prepared for review;
deployment, live-provider/model checks and publication remain open. See
[finish verification](agent-pivot-finish-verification.md).

## Product direction

LensLayer provides the context, authorized actions, and durable execution records
that agents need to complete work across business systems.

Retrieval remains a capability inside the platform. The product promise expands
from answering questions to producing verified outcomes.

Confirmed direction: support both developer infrastructure and hosted agents,
starting with developers bringing their own agents. The Python hosted service now
uses the same infrastructure for user-assigned document follow-ups, Calendar-only
events and combined goals, with shared database checkpoints. Its deployment and
live acceptance remain release work. The task-only CLI is a separate reference.

Implemented so far: scoped agent credentials, external-agent runs/events,
versioned evidence retrieval, typed versioned tools, immutable approvals,
transactional task dispatch, fenced Calendar dispatch/recovery, cancellation,
named composite checkpoints and typed human/agent input waits. The operator
dashboard includes Calendar consent/return and uncertain-effect recovery. The
packable TypeScript SDK, official local stdio MCP adapter, external-client example,
bounded task-planner CLI and developer guide are implemented. See
[agent API v1](agent-api-v1.md) and [additive interfaces](agent-interface-changes.md).
Hosted assignment/status pages and the dedicated planning/action worker lane are
implemented. Live Calendar/model verification, SDK publication and deployment
remain release work; none follows from local fake-provider checks.

The initial workflow should use the repository's existing strengths: document
and contract operations. General infrastructure primitives should not require a
contract, even when the first demonstration uses one. Validate broader demand
before investing in a large connector catalog or an arbitrary-task agent.

Suggested positioning: **Give agents context, permission to act, and proof of
completion.**

## Implementation status

These are local implementation results, not a production deployment test.

| Area | Locally implemented | Remaining |
| --- | --- | --- |
| Delegation | Agent principals, exact document/assignee/calendar scopes, revocation and expiry | Staging OIDC/session verification |
| Context | Retained literal-phrase retrieval, source versions/hashes/offsets | Broader context sources and retrieval strategies |
| Execution | Typed registry, task and Calendar tools, immutable approval, attempts/leases, read-back receipts | Additional customer-validated tools; provider-specific compensation |
| Workflow | Up to 20 named `all` conditions, durable progress, factual input waits | General DAGs, timers, long-lived scheduling and richer goal types |
| Connectors | Encrypted owned-Calendar OAuth, consent UI, stable IDs and GET-only recovery | Live sandbox round trip; additional live connectors |
| Developer surface | Packable SDK, local stdio MCP, public guide, operator views, review-artifact CI definition | Authorized npm release, actual MCP-host integration, hosted CI run |
| LensLayer planner | User-assigned hosted service, three fixed-fact goals, shared checkpoints, deterministic mode and opt-in decision-only model; separate task-only CLI | Real-model evaluation, staging OIDC and deployment |
| Operations | SQLite/PostgreSQL tests, migrations, lane-aware heartbeats, metrics, isolated staging plan and Cloudflare dry-run | Staging migration/load/restart/alerting and deployment |

`WorkflowTask.status = done` currently records a user-supplied status change; it
does not verify a provider action. Provider import routes accept multipart file
uploads; an active connection record is not proof of live provider access.

## Core contract

An agent submits a goal with explicit resource scope, allowed actions, budget,
deadline, and a structured success condition. LensLayer enforces those boundaries
independently of the agent's reasoning.

The lifecycle is:

```text
Create run -> retrieve evidence -> propose action -> check policy
           -> obtain approval when required -> execute -> verify -> finish
```

Agents may repeat retrieval and action steps within their run limits. The server
must reject unauthorized calls even if the agent proposes them confidently.
Retrieved text and tool responses are data, not sources of permission.

| Primitive | Responsibility |
| --- | --- |
| Agent identity | Who is acting, for which organization, under whose delegation |
| Resource | A permissioned document, record, or external object, with version/provenance |
| Tool definition | Typed inputs/outputs, implementation version, required scopes, action policy |
| Run | Goal, scope, limits, structured success condition, execution ownership, state |
| Step and attempt | Durable inputs, outcome, retry count, lease ownership, timestamps |
| Action invocation | Exact target and arguments, authorization result, idempotency key, provider receipt |
| Approval | Permission for a particular invocation; changed arguments require a fresh decision |
| Completion check | Independent assessment of the success condition with supporting receipts |
| Run event | Ordered progress and state changes available to clients and operators |

Implemented run states: `running`, `awaiting_approval`, `awaiting_input`,
`succeeded`, `failed`, `cancelled`. Actions additionally use `queued` and
`unknown_outcome` for ambiguous provider responses.

Mark a run successful only after its completion check passes. Client statements
such as "I finished" and successful text generation are insufficient evidence.
Caller-reported results must remain distinguishable from server-verified results.

## Execution ownership

For the developer-first release, the external agent owns planning and iteration.
LensLayer owns authorization, action dispatch, persistence, and verification.
The worker continues already authorized dispatch after a client disconnects.
Further planning/proposals/input require the external client to return; an idle
run is not evidence of autonomous goal completion.

The Python hosted runner owns planning too, using the same run/action interfaces.
It persists each bounded step, reuses original run/evidence/proposal identities
after restart, and requires every named verified receipt before success. Exact
facts are supplied by the human; the optional model can only proceed, request
confirmation or decline. It cannot synthesize actions or grant permission.
Keep model reasoning behind an adapter so infrastructure policy does not depend
on one model or agent framework. Do not execute arbitrary submitted code in the
API or existing worker; any future code execution needs an isolated runtime.

REST should establish the application contract first. SDKs and an MCP interface
can expose the same operations. MCP tool discovery/calling does not replace
LensLayer's execution ledger or authorization checks.

## First complete workflow

Goal: identify a selected agreement's renewal notice deadline and create one
assigned follow-up task carrying the clause evidence and calculated deadline.

1. Create a run scoped to one retained document and one allowed assignee.
2. Retrieve the renewal clause and its document version.
3. Prepare the task action, including evidence and date assumptions. If required
   dates or recipient identity are missing, ask for input instead of guessing.
4. Enforce tool/resource permissions and any configured approval rule.
5. Create the workspace task using a stable action idempotency key.
6. Read the task back and verify its assignee, deadline, and source reference.
7. Persist the completion result and expose it through run status/events.

The completed outcome is **follow-up task created**, not **renewal handled**.
The latter needs additional authorized actions and its own success conditions.

This first internal action proves the run protocol. A bounded Calendar event
connector and composite task/event workflow now extend it; local verification
uses fake provider HTTP with the real API and worker. Before claiming a live
cross-system release, complete the dedicated OAuth/sandbox-provider round trip.
Further connector selection should follow customer workflow evidence.

## Implementation sequence

Stages 1–6 below are implemented locally with bounded tool/workflow scope.
Stage 6 includes the Python hosted service and assignment UI; the TypeScript CLI
remains a separate task-only reference. The release checklist separates source
implementation from external verification/publication.

1. **Run and authorization foundation.** Add agent principals, delegations, runs,
   events, and explicit allowed tools/resources. Preserve existing human tasks and
   contract APIs. Introduce a domain under `service_domains/` with a matching API
   router; use additive Alembic migrations.
2. **First verified action.** Add typed evidence retrieval and workspace task
   creation. Implement approval binding, transactional action records, idempotent
   task creation, and deterministic completion checks.
3. **Execution recovery.** Persist action dispatch through an outbox, fenced
   worker claims, retry/backoff rules, and cancellation. Revalidate authorization
   and revocation immediately before dispatch. Enforce deadlines and budgets.
4. **One external connector.** Add tenant-scoped credential references, refresh
   and revocation handling, provider receipts, and reconciliation. Never put raw
   secrets in ordinary integration settings, prompts, or event payloads.
5. **Developer and operator experience.** Publish the API contract, a minimal SDK,
   and an MCP adapter. Add dashboard views for runs, actions, approvals, evidence,
   and failures. Reposition the landing page around demonstrated capabilities.
6. **Hosted execution.** Persist bounded planning through shared checkpoints,
   scoped internal delegation, a dedicated worker and human assignment/status
   UI. Keep deterministic fixed-fact execution available; optional model decisions
   do not replace authorization, approval or independent completion checks.

Use the existing FastAPI/PostgreSQL/worker architecture for the first bounded
workflow. Choose a dedicated durable execution engine only after evaluating
the required recovery, timers, concurrency, and operational burden. A queue or
database record alone does not establish correct durable execution.

## Reliability and acceptance conditions

- Cross-organization resources are inaccessible through every agent endpoint.
- An agent cannot exceed its delegated tools, targets, or expiry even when its
  owning human has broader access. Revoked principals cannot execute queued work.
- Approval applies to one immutable invocation and expires predictably.
- Repeating task creation or recovering from a worker crash creates one task.
- A stale worker cannot commit outcomes after losing its lease.
- External timeouts do not trigger blind duplicate writes. Use provider
  idempotency where available; otherwise reconcile by stable reference or stop
  with an unknown outcome requiring investigation.
- Cancellation prevents new dispatches; it does not imply reversal of an action
  already executed. Report partial effects and any available compensation.
- Missing evidence or a failed completion check prevents a successful result.
- Runs pause and resume across approval/input waits without losing their state.
- Logs show actor, scope, tool version, approval, attempts, and verified outcome,
  while redacting credentials and respecting source retention/deletion policies.

Validate these with meaningful API, worker-recovery, authorization, and adapter
tests. A cross-system release additionally needs a real sandbox-provider round
trip; a mock receipt alone cannot validate provider behavior.

## Design references

- [MCP tools specification](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/server/tools.mdx): tool interfaces and authorization-dependent discovery.
- [MCP tool annotations](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/): annotations are hints; enforce policy in the runtime.
- [Temporal activity definitions](https://github.com/temporalio/documentation/blob/main/docs/encyclopedia/activities/activity-definition.mdx): retries require deliberate idempotency.
- [Temporal event history](https://docs.temporal.io/encyclopedia/event-history): persisted execution history supports recovery. This is a design reference, not a decision to adopt Temporal.
