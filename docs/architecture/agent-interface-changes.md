# Platform interface changes — 8 October 2026

Implemented local contract. All paths below are relative to `/api/v1`, except
health. No SDK/MCP/dashboard files were changed by the platform track. The
original single-task routes remain available. No arbitrary tools or planner code
are accepted. All new inputs reject extra keys.

## Compatibility

- `POST /agent/runs` and `POST /agent/runs/{run}/actions` retain their original
  task-only schemas and status codes. Existing source-backed v1 flows work.
- New generalized creation routes are `/agent/workflows` and
  `/agent/runs/{run}/tool-actions`. Subsequent reads, approvals, evidence,
  cancellation and event pagination use the existing run routes.
- Empty `calendar_targets` are omitted from canonical run requests. Absent/null
  `condition_id` is omitted from canonical action input. Existing v1 hashes and
  approved input bindings are not rewritten. Reusing a key with a genuinely
  different request is still HTTP 409.
- Agent/run responses add `calendar_targets: CalendarTarget[]` (default `[]`).
  Task action responses can include `condition_id: null`.
- Tool names add `google_calendar.events.create` version `1`.
- Run statuses add **`awaiting_input`**. Existing terminal run statuses remain
  `succeeded | failed | cancelled`; `unknown_outcome` is an **action**, not a run,
  status. Runs with an uncertain external action fail with error
  `unknown_outcome`; do not treat this as proof that no effect occurred.
- Shared run/action list/detail responses can now contain calendar or composite
  conditions and calendar input. Consumers must discriminate by condition `type`
  and action `tool`, and render unknown tools/statuses without claiming success.
- Integration provider literals add `google_calendar`. Its ordinary
  connection list response contains only metadata. Generic metadata creation for
  this provider returns 422; OAuth is required. Generic revocation also performs
  the calendar disconnect lifecycle.
  The legacy provider catalog is unchanged; GET
  `/organizations/{org}/calendar/provider` (workspace member) returns one
  `IntegrationProviderResponse` with category `calendar`, capabilities
  `["events.create","events.get"]`, connection_mode `oauth`, and configured
  indicating an active encrypted OAuth grant.
- Legacy task response timestamps now contain explicit UTC; stored instants
  are unchanged.

## Delegated resources and tools

`CalendarTarget = {connection_id: string, calendar_id: string}`. Connection IDs
are 1–64 characters; calendar IDs 1–1024, no whitespace or wildcard `*`. A target
is an exact pair, not a connection-wide grant. The connection must have an
encrypted active same-tenant OAuth credential and its original calendar grant.
Reconnect creates a new connection ID; no queued action inherits new consent.

`POST /organizations/{org}/agents` accepts the existing fields, plus optional
`calendar_targets` (up to 100 distinct pairs). `allowed_tools` now supports up to
three distinct names. `contract_ids` and `assignee_ids` may be empty. At least one
contract or calendar resource must be delegated. For an independent calendar run:

```json
{
  "name": "Calendar assistant",
  "allowed_tools": ["google_calendar.events.create"],
  "contract_ids": [],
  "assignee_ids": [],
  "calendar_targets": [{"connection_id": "connection-id", "calendar_id": "sandbox@example.com"}],
  "require_approval": true,
  "expires_at": "2026-12-01T00:00:00Z",
  "max_actions_per_run": 2
}
```

Response remains 201 `{agent: AgentResponse, token: string}` with no-store.
AgentResponse adds the exact calendar grants. Tokens remain human-admin-only,
returned once, hashed, separate from human credentials.

`GET /agent/tools` returns existing `ToolResponse[]` with typed JSON schemas.
Calendar version 1 creates a private single timed event, no attendees, recurrence,
attachments, conference data or caller-controlled event ID. Google scope is
exactly `https://www.googleapis.com/auth/calendar.events.owned` (owned calendars
only). Broader Google scopes and scope changes are rejected, not used implicitly.

## Run creation and conditions

`POST /agent/workflows` → **201 AgentRunResponse**. Payload:

```json
{
  "idempotency_key": "calendar-run-1",
  "goal": "Create an approved appointment",
  "contract_ids": [],
  "calendar_targets": [{"connection_id": "connection-id", "calendar_id": "sandbox@example.com"}],
  "allowed_tools": ["google_calendar.events.create"],
  "max_actions": 1,
  "deadline_at": "2026-11-01T00:00:00Z",
  "success_condition": {
    "type": "calendar_event_created",
    "connection_id": "connection-id",
    "calendar_id": "sandbox@example.com",
    "summary": "Approved appointment",
    "start_at": "2026-10-30T09:00:00Z",
    "end_at": "2026-10-30T10:00:00Z"
  }
}
```

`contract_ids`/`calendar_targets` default to `[]`; goal (1–4000), key (1–128),
tool subset, maximum actions (1–20, within delegation), future bounded deadline
have the same semantics as v1. All input date-times require a timezone and become
UTC. Calendar summary 1–512; end must be after start, duration at most 31 days.

`success_condition` is exactly one of:

1. Existing `TaskSuccessCondition = {type: "workspace_task_created",
   contract_id, assigned_to_user_id, due_at}`.
2. `CalendarSuccessCondition` shown above.
3. `CompositeSuccessCondition = {type: "all", conditions:
   [{id: string, condition: TaskSuccessCondition | CalendarSuccessCondition}]}`.
   IDs must be unique, 1–64 characters; 1–20 entries, no nesting. Action budget
   must be at least the number of entries. Each required tool must be allowed;
   task conditions require `documents.retrieve` and `workspace.tasks.create`.

Example mixed success condition (include both tools, source contract, assignee,
calendar grant, and `max_actions: 2` in the run/delegation):

```json
{
  "type": "all",
  "conditions": [
    {"id": "task", "condition": {"type": "workspace_task_created", "contract_id": "contract-id", "assigned_to_user_id": "user-id", "due_at": "2026-10-30T09:00:00Z"}},
    {"id": "calendar", "condition": {"type": "calendar_event_created", "connection_id": "connection-id", "calendar_id": "sandbox@example.com", "summary": "Renewal reminder", "start_at": "2026-10-30T09:00:00Z", "end_at": "2026-10-30T10:00:00Z"}}
  ]
}
```

Run response uses the existing fields plus calendar targets and the expanded
condition/status union. Progress persists in `result`:
`{type: "all", verified: boolean, completed_conditions:
{[conditionId]: {action_id: string, result: VerifiedActionResult}}}`.
Each receipt certifies its exact read-back snapshot at action completion, not
continuous existence or immutability of the remote/internal object afterwards.
The run cannot succeed until every named condition has a server-verified receipt.

## Actions, approval, reconciliation and effects

`POST /agent/runs/{run}/tool-actions` → **202 AgentActionResponse**:

```json
{
  "idempotency_key": "calendar-action-1",
  "tool": "google_calendar.events.create",
  "tool_version": "1",
  "input": {
    "type": "calendar_event_created",
    "connection_id": "connection-id",
    "calendar_id": "sandbox@example.com",
    "summary": "Approved appointment",
    "start_at": "2026-10-30T09:00:00Z",
    "end_at": "2026-10-30T10:00:00Z",
    "description": "Optional caller-provided description"
  }
}
```

`tool_version` defaults to `1`; other versions are invalid. Task inputs remain
the v1 schema. Both tool inputs allow optional `condition_id`; it is **required**
to select a named composite entry, and absent for single conditions. A condition
can bind only one action (different idempotency keys cannot duplicate it).

Calendar input optionally adds **both** `contract_id` and `evidence_id`, using a
current retained source receipt from the same run/contract and requiring scoped
retrieval. Neither is required for independent calendar goals. Source text is
not copied automatically into provider events or the ledger. Description is
caller data, up to 4000 characters. Pair, fields, target and condition ID are
included in the immutable input approval hash; tool/version are fixed on the
immutable action row. Supplying human input cannot mutate an action or scope.
Changed input requires a new authorized run/action.

Approvals use the unchanged human approval route/body. Calendar fields must
match the exact success condition. Agent self-approval is never permitted.

ActionResponse retains its fields; `input` is now task/calendar union, and status
is `queued | awaiting_approval | running | unknown_outcome | succeeded | failed |
cancelled`. Calendar verified results:
`{type: "calendar_event_created", event_id, connection_id, calendar_id, summary,
start_at, end_at, verified: true, verification_method: "google_events_get",
verified_at, provenance_origin: "approved_action" | "retained_document",
partial_effect: boolean}`. Document-backed results additionally include
`evidence_id, version_id, source_sha256`.
`provenance_origin:"approved_action"` identifies the authorized immutable action,
not necessarily a human approval: consult `approval_status` and the delegation's
`require_approval` to distinguish human-approved from approval-free execution.

Unverified result: `{verified: false, dispatch_may_have_effect: boolean,
reconciliation_error: string}`. Stable ID is server-generated `ll` + output UUID
without hyphens, valid base32hex. Timeout/409 never triggers a new ID or an update
to a conflicting event. Event GET must verify exact fields, provenance and aware
times. Malformed JSON/timestamps cannot constitute completion proof.

Before a committed dispatch marker, failed initial GETs produce action/run
`failed`, with redacted `provider_read_failed` or `provider_response_invalid`,
`verified:false` and `dispatch_may_have_effect:false`. No POST occurred and
operator reconciliation is not applicable. The same read failure **after** a
persisted dispatch produces `unknown_outcome` and `dispatch_may_have_effect:true`.
The conservative dispatch marker is never cleared; every recovery is GET-only.

Cancellation prevents new dispatch; a write racing cancellation may already
exist. Its fenced receipt is `cancelled` + `partial_effect=true` if verified, or
`unknown_outcome` if uncertain. It never changes a cancelled run to success.

`POST /organizations/{org}/agent-runs/{run}/actions/{action}/reconcile` → **202
AgentActionResponse**, no payload, owner/admin only. Only dispatched
`unknown_outcome` calendar actions, with active scope and remaining attempt
budget, can be enqueued. Recovery is GET-only; never inserts. Terminal run status
is not reopened. Expired approval/delegation/source still prevents completion.
No deletion/compensation API is implemented.

## Structured missing input

| Route | Authentication | Response |
| --- | --- | --- |
| POST `/agent/runs/{run}/input-requests` | Owning agent | 201 InputRequestResponse |
| GET `/agent/runs/{run}/input-requests` | Owning agent | 200 InputRequestResponse[] |
| POST `/agent/runs/{run}/input-requests/{request}/supply` | Owning agent, responder=agent only | 200 InputRequestResponse |
| GET `/organizations/{org}/agent-runs/{run}/input-requests` | Workspace member | 200 InputRequestResponse[] |
| POST `/organizations/{org}/agent-runs/{run}/input-requests/{request}/supply` | Owner/admin, responder=human only | 200 InputRequestResponse |

Request payload:

```json
{
  "idempotency_key": "notice-input-1",
  "reason": "Confirm the source interpretation before proposing an action",
  "fields": [{"name": "notice_days", "type": "integer", "prompt": "How many calendar days?"}],
  "expires_at": "2026-10-29T12:00:00Z",
  "responder": "human"
}
```

Reason 1–1000; fields 1–20 distinct names matching `[a-z][a-z0-9_]*` (1–64),
prompt 1–512. Types `text | date_time | integer | boolean`. Expiry is future and
at most the run deadline; default responder human. Credential-like field names
are rejected; this API is not a secret collection channel. Up to 20 requests per
run, only one pending. Requests cannot suspend/mutate any live proposed action;
pause between actions instead. A pending request puts the run in `awaiting_input`
and blocks new action proposals. Deadline/expiry closes the wait (`input_expired`).

Supply payload is exactly `{"values":{"notice_days":30}}`. Values must match
all and only requested fields: text ≤4000, integer signed 32-bit (not boolean),
boolean strict, date_time an aware timestamp normalized to UTC. Supply is recorded
once, immutable; same normalized values can be replayed, different values 409.
It returns run control to running, without changing deadline, conditions or grants.

`InputRequestResponse = {id, run_id, request: InputRequestCreate,
status: "pending" | "supplied" | "expired", values: object,
supplied_by_user_id: string|null, supplied_by_agent_id: string|null,
supplied_at: UTC datetime|null, created_at: UTC datetime}`.
Inputs are visible to same-tenant run readers; events contain request identifiers
and responder attribution, not values. Agent-supplied facts are not human approval.

## OAuth and connection lifecycle

Human owner/admin routes only:

| Route | Input | Response |
| --- | --- | --- |
| POST `/organizations/{org}/calendar/oauth/start` | `{display_name: string(1–255), calendar_id: string(1–1024)}` | 200 `{authorization_url: string, expires_at: UTC datetime}`; no-store |
| POST `/organizations/{org}/calendar/oauth/callback` | `{state: string(1–4096), code: string(1–4096)}` | 201 existing IntegrationConnectionResponse; no-store |
| POST `/organizations/{org}/calendar/connections/{connection}/disconnect` | No body | 200 `{connection_id, status:"revoked", provider_revocation_pending:boolean}` |

OAuth is a frontend-relayed authorization-code flow: use the configured exact
redirect URI, then POST code/state using the same authenticated human who started
consent. Clear the browser query and suppress callback URL logging. The API does
not redirect or accept caller return URLs. Signed state is human/organization/
client/redirect bound, expires after ten minutes and is atomically one-time.
Token exchange consumes state even on failure; restart consent, not callback.
Missing configuration/encryption returns 503; invalid state 400; replay 409.

Connection settings contain only calendar IDs and credential mode. Credentials
are encrypted in a separate bound table. `external_account_id` is an opaque
`oauth-grant:<connection-id>` identifier, not a verified Google identity. Active
means OAuth grant stored, not proof of access to the selected calendar; provider
permissions are enforced on dispatch. Disconnect permanently blocks local
execution before remote revocation; pending remote revocation is explicit and
can be retried by calling disconnect again. Reconnect requires a new grant.

## Operations and errors

- GET `/organizations/{org}/agent-metrics`, owner/admin → 200
  `{runs_by_status: Record<string,number>, actions_by_status: Record<string,number>,
  event_counters: Record<string,number>, expired_action_leases: number,
  retry_attempts: number, oldest_queued_action_age_seconds: number,
  pending_provider_revocations: number, observed_at: UTC datetime}`.
- GET `/health/worker` (no API prefix) → 200
  `{status:"ready", service:"platform-worker", heartbeat_age_seconds:number}` or
  503 when heartbeat missing/stale. API readiness checks the additive action
  schema as well as database/storage access.
- New ordered events: `run.checkpoint`, `input.requested`, `input.supplied`,
  `action.intent_persisted`, `action.dispatched`, `action.partial_effect`,
  `action.unknown_outcome`, `action.reconciliation_requested`.
- HTTP errors still use `{detail: string}`: 401 credential, 403 scope/authority,
  404 tenant-scoped not found, 409 binding/state conflict, 422 typed invalid input.
  Provider bodies/tokens are never returned. Important durable Calendar failures:
  `dispatch_policy_denied`, `credential_revoked`, `scope_changed`,
  `credential_changed`, `token_exchange_failed`, `provider_event_conflict`,
  `provider_write_rejected`, `provider_read_failed`, `provider_response_invalid`,
  `unknown_outcome`, `retry_limit_exceeded`.

Live OAuth/calendar/staging verification remains a separate release gate, not
established by this interface document or fake-provider tests.
