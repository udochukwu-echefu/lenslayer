# Agent API v1: implemented backend contract

This is the contract for LensLayer's first developer infrastructure slice.
Schemas live in `backend/app/agent_schemas.py`; development OpenAPI is available
at `/openapi.json` and `/docs`. Paths below are relative to `/api/v1`.

Additive extensions implement Calendar/composite workflows on separate creation
routes, structured input waits, OAuth and metrics. This document retains the
original v1 single-task contract; see [interface changes](agent-interface-changes.md)
for new shared response unions and routes. Existing v1 hashes/approval bindings
remain unchanged. Real-provider/staging proof is still pending.

## Supported behavior

External agents own reasoning and planning. LensLayer owns delegated access,
bounded run state, source-backed retrieval, immutable action approval, durable
dispatch, and independent database read-back verification.

The shipped tools are `documents.retrieve` and `workspace.tasks.create`, version
`1`. The shipped success condition is `workspace_task_created`. This release
creates internal workspace tasks; external provider writes, a hosted agent
planner, and an MCP adapter are subsequent work. A local server-side TypeScript
SDK and operator dashboard consume this contract; see the
[developer quickstart](../developer-agent-quickstart.md). The SDK is not yet
published to npm.

## Authentication and administration

Human routes use the existing workspace identity/OIDC boundary. Only owners and
administrators can list/create/revoke agent delegations, cancel workspace runs,
or resolve action approvals. Organization members can inspect that workspace's
runs, events, actions, and retained evidence.

Agent routes require `Authorization: Bearer ll_agent_...`. They never use the
workspace's local development headers or public contract API keys. An agent
credential cannot authorize a human workspace route, including in local mode.
The credential is returned once on creation with `Cache-Control: no-store`.
Only its SHA-256 hash and a display prefix are persisted.

Delegation expiry must be within the next 365 days. Revocation is permanent.
Removing or demoting the delegating owner/admin blocks the credential and any
queued execution. Delegated resource IDs and assignees must belong to the same
organization. There are no wildcard grants or agent self-approval routes.

| Human endpoint | Result |
| --- | --- |
| `GET /organizations/{org}/agents` | `AgentResponse[]` |
| `POST /organizations/{org}/agents` | 201 `{agent: AgentResponse, token: string}` |
| `POST /organizations/{org}/agents/{agent}/revoke` | `AgentResponse`; cancels unfinished runs |
| `GET /organizations/{org}/agent-runs?limit=50` | `AgentRunResponse[]`, newest first |
| `GET /organizations/{org}/agent-runs/{run}` | `AgentRunResponse` |
| `GET /organizations/{org}/agent-runs/{run}/events?after_sequence=0&limit=100` | `AgentEventResponse[]` |
| `GET /organizations/{org}/agent-runs/{run}/actions` | `AgentActionResponse[]` |
| `GET /organizations/{org}/agent-runs/{run}/evidence/{evidence}` | `EvidenceResponse`; subject to source retention |
| `POST /organizations/{org}/agent-runs/{run}/cancel` | `AgentRunResponse` |
| `POST /organizations/{org}/agent-runs/{run}/actions/{action}/approval` | `AgentActionResponse` |

Agent creation input:

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

`AgentResponse` includes `id`, `organization_id`, `delegated_by_user_id`, `name`,
`token_prefix`, `allowed_tools`, `contract_ids`, `assignee_ids`, `require_approval`,
`max_actions_per_run`, `status` (`active`, `expired`, `revoked`), `expires_at`,
`revoked_at`, and `created_at`. It contains no credential or credential hash.

## Agent operations

| Agent endpoint | Result |
| --- | --- |
| `GET /agent/tools` | Allowed `ToolResponse[]`, typed input schemas and approval policy |
| `GET /agent/runs?limit=50` | This agent's `AgentRunResponse[]` |
| `POST /agent/runs` | 201 `AgentRunResponse`; idempotent |
| `GET /agent/runs/{run}` | This agent's `AgentRunResponse` |
| `GET /agent/runs/{run}/events?after_sequence=0&limit=100` | `AgentEventResponse[]` |
| `GET /agent/runs/{run}/actions` | `AgentActionResponse[]` |
| `POST /agent/runs/{run}/cancel` | `AgentRunResponse` |
| `POST /agent/runs/{run}/evidence` | `EvidenceResponse` |
| `GET /agent/runs/{run}/evidence/{evidence}` | `EvidenceResponse` |
| `POST /agent/runs/{run}/actions` | 202 `AgentActionResponse`; durable enqueue, idempotent |

Run creation input:

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

The requested tools/resources must be subsets of the delegation. Both tools are
required for this workflow. The action limit cannot exceed the delegation's
limit (1–20). The deadline must be future and no later than the agent's expiry.
Every date-time input requires an explicit timezone and is normalized to UTC.
Dates in examples are illustrative; use future execution deadlines when running.

`AgentRunResponse` includes `id`, `organization_id`, `agent_id`,
`idempotency_key`, `goal`, `execution_owner` (`external_agent`), `contract_ids`,
`allowed_tools`, `max_actions`, `status`, `success_condition`, `result`,
`error_code`, `deadline_at`, `created_at`, `updated_at`, and `completed_at`.

The states are `running`, `awaiting_approval`, `succeeded`, `failed`, and
`cancelled`. External planning starts in `running`; no hosted planner runs in
the background. An abandoned run remains open until its deadline. The worker
closes expired deadlines, credentials/delegations, and approval windows.

## Evidence retrieval and review

POST evidence input is `{contract_id, query, version_id?}`. Query is a literal,
case-insensitive phrase (2–200 characters). This first implementation retrieves
a bounded surrounding excerpt; it does not call a model or implement semantic
search. Missing phrases return 404; absent/expired retained text returns 409.
Omitting `version_id` selects the latest version. Tasks must cite the latest
version at action proposal, approval, and dispatch.

`EvidenceResponse` includes `id`, `contract_id`, `version_id`, `source_sha256`,
`excerpt`, `start_offset`, `end_offset`, and `created_at`. Offsets refer to the
original extracted text, not PDF page coordinates or the original file bytes.
The hash covers the complete extracted source string.

The receipt stores only version IDs, offsets, and hash. Excerpts are read from
retained source on demand. Deleting/expiring the document or removing retained
text makes the evidence unavailable. Events and automatic task provenance do
not duplicate source text. Caller-supplied task titles/descriptions are ordinary
task data and may themselves contain text the caller chooses to retain.

New evidence receipts are capped at 100 per run by default, configurable with
`LENSLAYER_PLATFORM_AGENT_MAX_EVIDENCE_RECEIPTS_PER_RUN` (1–1000). Existing
receipts can still be read without creating another receipt. Write invocations
are independently bounded by `max_actions`.

## Immutable actions and approvals

Task action input:

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
    "evidence_id": "evidence-receipt-id",
    "deadline_basis": {"renewal_date": "2026-11-29", "notice_days": 30}
  }
}
```

`deadline_basis` is optional. When supplied, the server verifies subtraction of
calendar days against the due date in UTC. Those inputs are explicitly recorded
as caller-supplied; matching a real source excerpt does not establish that an
agent correctly interpreted the contract. Missing factual inputs must come from
the developer/user or a separate grounded reasoning step.

The target, assignee, and due instant must exactly match the success condition.
The evidence receipt must belong to the same run and contract and still match
the latest retained source. Action creation is bounded by `max_actions` and
persists the invocation and its queued dispatch state in one transaction.

`AgentActionResponse` includes `id`, `run_id`, `idempotency_key`, `tool`,
`tool_version`, `input`, `input_sha256`, `status`, `attempts`, `approval_status`,
`approved_by_user_id`, `approval_reason`, `approval_expires_at`, `result`,
`error_code`, `created_at`, `updated_at`, and `completed_at`.

An action starts `awaiting_approval` with `approval_status=pending` by default.
An explicit owner/admin delegation with `require_approval=false` queues it
directly with `approval_status=not_required`. Queued work is claimed as `running`
and ends `succeeded`, `failed`, or `cancelled`.

Human approval input is `{decision: "approved" | "rejected", reason: "..."}`.
The approval window ends at the earlier of run deadline and one hour after
proposal. Approval binds the canonical input hash and approver, revalidates
source/scope, and queues the original action. There is no mutation endpoint for
approved input. Rejection fails the run. Dispatch checks current approver
authority again. Expired approvals require a new run/action, not silent renewal.

## Idempotency, dispatch, verification, and cancellation

Run idempotency keys bind to an agent; action keys bind to a run. Same key and
same validated input returns the original record, including after completion.
Different input with that key returns 409. Persist and reuse keys when retrying;
generating a new key creates a new operation. Idempotency does not grant access
after credential revocation or expiry.

The action record is a transactional dispatch outbox. The existing worker claims
it with compare-and-swap, a lease token, and bounded attempts. Default lease is
60 seconds and attempt limit is 3, configurable through
`LENSLAYER_PLATFORM_AGENT_ACTION_LEASE_SECONDS` and
`LENSLAYER_PLATFORM_AGENT_ACTION_MAX_ATTEMPTS`.

Task creation, read-back verification, action result, run result, and events
commit together. A stable output ID prevents duplicate task creation. A crash
before commit rolls back the task; an expired lease can be reclaimed. A worker
whose lease has expired or been replaced cannot commit the result. Principal,
run, and action locks serialize dispatch with revocation and cancellation.

Success result fields include `type=workspace_task_created`, `task_id`,
`contract_id`, `assigned_to_user_id`, `due_at`, `evidence_id`, `version_id`,
`verified=true`, `verification_method=database_read_back`, and `verified_at`.
This certifies the persisted task fields and source provenance at completion;
it does not certify that the follow-up task was itself performed or that fields
remain unchanged indefinitely.

Cancellation/revocation cancels unfinished dispatches. Completed effects remain
visible. Cancelling an already terminal run returns its terminal state. There is
no external provider side effect or external-write retry guarantee in this slice.

Events contain `id`, `run_id`, `sequence`, `type`, `data`, and `created_at`.
Fetch ascending pages using the last sequence as `after_sequence`. Limits are
1–200 for events and 1–100 for run lists. Event payloads contain identifiers and
outcomes, not raw evidence or credentials. Polling should stop on terminal state
or its own bounded timeout and respect the run deadline.

Common durable failure codes include `approval_rejected`, `approval_expired`,
`deadline_exceeded`, `agent_inactive`, `delegation_denied`, `source_unavailable`,
`evidence_or_policy_expired`, `invalid_action`, and `retry_limit_exceeded`.
Cancellation codes include `agent_revoked`, `cancelled_by_operator`, and
`cancelled_by_agent`. HTTP failures use FastAPI's `detail` field: 401 credential,
403 permissions, 404 unavailable resource, 409 state/input conflict, 422 invalid
typed input. Do not blindly retry these with new idempotency keys.

## Local execution and validation

Run the existing migration/API/worker commands:

```sh
.venv/bin/python -m alembic -c backend/alembic.ini upgrade head
.venv/bin/python -m uvicorn backend.app.main:app --reload --port 8000
# In a second terminal:
.venv/bin/python -m backend.app.worker
# Or process available work once:
.venv/bin/python -m backend.app.worker --once
```

Upload a contract with `retain_source_text=true`, let the review worker extract
it, and select its workspace ID and an allowed member's user ID. Create the
delegation through the human endpoint, then call run/evidence/action endpoints
using its returned credential. Resolve approvals through the human API until
the dashboard agent experience is available. Poll the run for its verified result.

`review_worker_job`, when configured, triggers the existing worker job after
enqueue/approval. A continuously running worker is still required to expire
abandoned runs, approval windows, and recover interrupted dispatch leases.

Backend regression coverage:

```sh
.venv/bin/python -m unittest tests.test_agent_infrastructure -v
.venv/bin/python -m unittest discover -s tests -v
```

Tests exercise real SQLite persistence and worker transactions, including upload
and extraction with a stub analyzer, concurrent idempotency/claims, stale worker
recovery, permissions, revocation, cancellation, retention, and approvals.
PostgreSQL locking/load verification and a real sandbox-provider round trip are
additional requirements before a production/cross-system execution claim.
