# Prompt for the second agent

Copy everything below into your other agent. The primary agent is implementing
the backend concurrently; this assignment deliberately owns different files.

---

You are implementing LensLayer's developer and operator experience while another
agent implements the backend. Work autonomously within the scope below, verify
your work, and report concrete results. Challenge flawed assumptions rather than
agreeing automatically.

## Product direction

LensLayer is evolving from evidence-led document intelligence into infrastructure
that gives agents context, permission to act, and proof of completion. Support
both external developer-built agents and hosted LensLayer agents, starting with
developer infrastructure. Retrieval remains a core capability. Hosted planning
comes later and must consume the same APIs.

Read `docs/architecture/agent-infrastructure-direction.md`, the repository's
AGENTS.md instructions, `README.md`, and
`docs/architecture/repository-maintenance.md` before editing. Inspect the current
workspace and follow its existing auth, API transport, design, and test patterns.

The first real workflow is: an external agent retrieves evidence from a retained
contract version, proposes creation of an assigned follow-up task with a due
date, obtains any required human approval, and LensLayer executes and verifies
the task. The verified outcome is "follow-up task created", not "renewal handled".
The platform verifies source identity, persisted task fields, and optional date
arithmetic; it does not claim to independently validate legal interpretation.

## Ownership and collaboration

You own:

- `dashboard/` changes for agents, runs, events, and action approvals.
- `sdk/` for a small dependency-light TypeScript developer SDK and tests.
- `examples/agents/` for a runnable external-agent example.
- `docs/developer-agent-quickstart.md` for developer instructions.

The primary agent owns `backend/`, backend tests under `tests/`, migrations,
root/backend README changes, `docs/architecture/agent-infrastructure-direction.md`,
and `docs/architecture/agent-api-v1.md`. Do not edit those concurrently. Read the
API contract and actual OpenAPI/schema sources as they arrive. If an endpoint is
missing, document the blocker; do not invent a working endpoint or change the
backend to match your UI.

There are existing uncommitted landing-page edits. Do not reset or overwrite any
existing changes. Leave `landing/` and branding untouched in this assignment.
Do not deploy, purchase services, create real provider credentials, or send
messages. Keep agent bearer tokens server-side in examples; never persist them
in browser storage, analytics, error reports, or generated screenshots.

Use a separate worktree/branch if you have an independent checkout. If sharing
this checkout, stay strictly inside your ownership. Do not broadly stage or
commit another agent's files. Do not spawn paid subagents.

## Backend contract for the first slice

Base path is `/api/v1`. Human workspace endpoints use existing authenticated
workspace identity. Agent endpoints require their own `Authorization: Bearer
ll_agent_...` token; an ordinary user JWT/public contract API key is not an agent
token. All date-time inputs are ISO 8601 with an explicit timezone.

Human endpoints:

- `GET /organizations/{org}/agents`
- `POST /organizations/{org}/agents` -> 201 `{agent, token}`; token appears once.
- `POST /organizations/{org}/agents/{agent}/revoke`
- `GET /organizations/{org}/agent-runs?limit=50`
- `GET /organizations/{org}/agent-runs/{run}`
- `GET /organizations/{org}/agent-runs/{run}/events?after_sequence=0&limit=100`
- `GET /organizations/{org}/agent-runs/{run}/actions`
- `GET /organizations/{org}/agent-runs/{run}/evidence/{evidence}`
- `POST /organizations/{org}/agent-runs/{run}/cancel`
- `POST /organizations/{org}/agent-runs/{run}/actions/{action}/approval`
  with `{decision: "approved" | "rejected", reason: "..."}`.

Agent creation payload:

```json
{
  "name": "Renewal assistant",
  "allowed_tools": ["documents.retrieve", "workspace.tasks.create"],
  "contract_ids": ["contract-id"],
  "assignee_ids": ["workspace-user-id"],
  "require_approval": true,
  "expires_at": "2026-12-01T00:00:00Z",
  "max_actions_per_run": 1
}
```

Agent endpoints:

- `GET /agent/tools` -> allowed typed tools.
- `GET /agent/runs?limit=50`
- `POST /agent/runs` -> 201, idempotent by the supplied key.
- `GET /agent/runs/{run}`
- `GET /agent/runs/{run}/events?after_sequence=0&limit=100`
- `GET /agent/runs/{run}/actions`
- `POST /agent/runs/{run}/cancel`
- `POST /agent/runs/{run}/evidence` with `{contract_id, query, version_id?}`.
- `GET /agent/runs/{run}/evidence/{evidence}` for retained-source inspection.
- `POST /agent/runs/{run}/actions` -> 202 with an immutable action invocation.

Run creation payload:

```json
{
  "idempotency_key": "renewal-follow-up-001",
  "goal": "Create an assigned renewal follow-up with clause evidence",
  "contract_ids": ["contract-id"],
  "allowed_tools": ["documents.retrieve", "workspace.tasks.create"],
  "max_actions": 1,
  "deadline_at": "2026-11-01T00:00:00Z",
  "success_condition": {
    "type": "workspace_task_created",
    "contract_id": "contract-id",
    "assigned_to_user_id": "workspace-user-id",
    "due_at": "2026-10-30T09:00:00Z"
  }
}
```

Evidence response contains `id`, `contract_id`, `version_id`, `source_sha256`,
`excerpt`, `start_offset`, `end_offset`, and `created_at`. It is a source-backed
retrieval receipt, not a model-generated legal conclusion.

Task action payload:

```json
{
  "idempotency_key": "create-follow-up-001",
  "tool": "workspace.tasks.create",
  "input": {
    "contract_id": "contract-id",
    "assigned_to_user_id": "workspace-user-id",
    "title": "Review renewal notice deadline",
    "description": "Confirm whether to renew before sending notice.",
    "due_at": "2026-10-30T09:00:00Z",
    "evidence_id": "evidence-receipt-id"
  }
}
```

Optional `input.deadline_basis` is `{renewal_date: "2026-11-29", notice_days: 30}`;
the backend validates date arithmetic against `due_at`'s UTC date. Missing dates
must be supplied explicitly, never fabricated by the example.

Run responses contain identity/scope, `status`, `success_condition`, `result`,
`error_code`, and timestamps. Actions contain typed input, `input_sha256`, tool
version, `status`, approval information, attempts, result, and timestamps. Events
have monotonically increasing `sequence`, `type`, `data`, and `created_at`.
Confirm exact field names from `docs/architecture/agent-api-v1.md` and
`backend/app/agent_schemas.py` before finalizing types.

Actions move from `awaiting_approval` or `queued` to `running` and then
`succeeded`, `failed`, or `cancelled`. The durable worker creates and reads back
the task and sets the run to `succeeded` only after verification. Approval is
bound to the immutable input hash and expires; the UI cannot edit an approved
invocation or self-authorize from an agent endpoint. Revocation and cancellation
prevent new work and do not imply rollback of completed actions.

## Deliverables

1. Add Agents and Runs navigation to the existing dashboard. Use the current
   workspace provider and API transport, with tenant-specific query keys.
2. Build agent list/create/revoke controls for owners/admins. Show scope,
   expiry, and approval policy. Show a new credential once with an explicit copy
   control, then clear it from component state on dismissal/navigation.
3. Build run list/detail screens showing the goal, status, exact success
   condition, execution ownership, ordered events, actions, evidence references,
   verified result, and understandable errors.
4. Implement action approval/rejection for authorized humans, showing the exact
   target, assignee, due date, evidence receipt, immutable input, expiry, and
   hash. Include cancellation and clear partial-effects wording.
5. Handle loading, errors, empty states, tenant switches, denied access, and
   read-only demo mode. Synthetic demo data must be explicitly labeled and
   must never appear as real executions. Avoid fake "run agent" functionality
   before a hosted runner exists.
6. Build a minimal server-side TypeScript SDK with typed requests, run/action
   idempotency keys, useful HTTP errors, event pagination, and bounded polling.
   Retrying a mutation must preserve its original idempotency key. Never retry
   authorization/validation failures blindly. Do not add a framework dependency.
7. Add an example that reads credentials/config from environment variables,
   creates a run, retrieves renewal evidence, proposes the task, and polls until
   terminal state. Required contract, assignee, due date, and deadline come from
   explicit input. Explain how a human resolves approvals in the dashboard.
8. Write a quickstart distinguishing shipped internal task execution from future
   external connectors and hosted agents. Include real setup, worker startup,
   token handling, commands, request examples, and supported failure states.

## Validation and reporting

Run dashboard lint/tests/build and meaningful SDK tests. Check a representative
workflow against the local backend if it is available. Verify that approval
buttons respect role/state, credential values are not logged, events paginate
without duplicates, and polling stops on terminal state/deadline. Inspect the UI
at desktop/mobile sizes using available browser tooling.

Report the files changed, commands run and results, any blockers, and the exact
capabilities delivered. Do not claim production readiness, live OAuth, MCP
hosting, or arbitrary autonomous task execution unless you implemented and
tested them. Provide concise integration notes for the backend agent.
