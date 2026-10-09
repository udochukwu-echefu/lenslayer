# Hosted LensLayer tasks (finish contract, 9 October 2026)

All paths below use the existing `/api/v1` prefix and **human owner/admin auth**.
Agent bearer credentials cannot call them. No browser agent credential is accepted
or returned. The backend creates an exact internal delegation, always requiring
human approval, expiring at the supplied task deadline.

| Method/path | Response |
| --- | --- |
| POST `/organizations/{org}/hosted-agent-tasks` | 201 TaskResponse, `Cache-Control: no-store`; normalized idempotent replay |
| GET `/organizations/{org}/hosted-agent-tasks?limit=50` | 200 TaskResponse[], limit 1–100, newest first |
| GET `/organizations/{org}/hosted-agent-tasks/{task}` | 200 TaskResponse |
| POST `/organizations/{org}/hosted-agent-tasks/{task}/cancel` | 200 TaskResponse; no body |
| GET `/organizations/{org}/hosted-agent-capabilities` | 200 `{enabled, goal_types, planner_modes, max_deadline_days:7}` |

Strict create request (unknown keys rejected):

```json
{
  "idempotency_key": "follow-up-1",
  "goal_type": "retained-document-follow-up",
  "goal": "Create an approved document follow-up",
  "deadline_at": "2026-10-10T12:00:00Z",
  "contract_id": "contract-id",
  "assignee_id": "user-id",
  "due_at": "2026-11-01T09:00:00Z",
  "planner_mode": "deterministic"
}
```

- Goal types: `retained-document-follow-up | calendar-event | follow-up-and-calendar`.
- Key 1–128, goal 1–4000, timezone-aware future deadline no more than seven days.
- Document goals require `contract_id`, `assignee_id`, aware `due_at`; optional
  `version_id`, `query` (2–200, default `notice`), `task_title` (1–512, default
  `Review document follow-up`), `task_description` (≤4000, default empty).
- Calendar goals require `calendar:{type:"calendar_event_created", connection_id,
  calendar_id, summary, start_at, end_at}` using the existing strict Calendar
  condition schema. Calendar-only requests reject all document/task fields;
  document-only requests reject `calendar`. Combined goals require both.
  The inherited Calendar schema normalizes its omitted `type` to the fixed
  `calendar_event_created` value; any other type is rejected. It also enforces
  a positive event interval of at most 31 days and explicit timezones.
- Caller facts/title/description are preserved after standard whitespace/UTC
  normalization. No inferred dates, identities, model-written action fields or
  automatically copied source text. Composite names are `task` and `calendar`.
- `planner_mode` defaults to `deterministic`: honest fixed workflow, no model call.
  Optional `model` mode requires separately configured product access, exactly
  `gpt-6.1-sol` / `high`; never subscription credentials. **Before selection, UI
  must disclose that the goal/fixed facts and a retained excerpt will be shared
  with the model provider.** No source is shared in deterministic mode.

TaskResponse is exactly:
`{id, organization_id, created_by_user_id, goal_type, goal, planner_mode, status,
phase, run_id:string|null, agent_id:string|null, error_code, deadline_at, created_at,
updated_at, completed_at:datetime|null}`. Timestamps are explicit UTC. Status:
`queued | planning | awaiting_input | awaiting_approval | running | succeeded |
failed | cancelled`. `phase` is metadata-only, not reasoning/source/provider text.
Current phases: `initialize`, `retrieve`, `model`, `confirm_input`, `propose_task`,
`propose_calendar`, `observe`, `complete`. A 201 normally returns `queued` with
null run/agent IDs; the worker atomically binds both on its first checkpoint.

Run responses add `execution_owner:"lenslayer_hosted_agent"`; existing external
runs keep `external_agent` as default. Use existing human `/agent-runs/{run}`
detail/action/evidence/event/input/approval APIs. Success means the **existing run
has verified every matching action**, not that a planner generated text. Calendar
unknown outcomes/partial effects retain existing semantics; cancellation does not
promise external rollback. Hosted status observes the ledger asynchronously.

Optional model output is a bounded decision only (`proceed`, `needs_input`, or
`decline`), not arbitrary tools/fields. `needs_input` requests one human boolean
`confirm_plan` through existing input routes; true resumes the same fixed plan,
false fails `plan_declined`. It never replaces action approval. Waits do not spend
model budget. An ambiguous charged call/crash fails `model_outcome_unknown` rather
than making another call. Raw model output/source/bearers are not checkpoints.

Errors use existing `{detail}` (string for service errors, structured validation
entries for request-schema 422s): 401 human auth, 403 role/tenant authority,
404 scoped task/resource, 409 changed idempotency input, 422 missing/irrelevant or
invalid facts, 503 hosted/model mode unconfigured. Replay of an existing request
does not create another run or widen delegation. Service shutdown does not remove
the persisted task; a continuous `--agents-only` worker resumes it.

Cancellation is idempotent. A run that already finished retains its matching
verified terminal outcome rather than being falsely relabeled cancelled. A timely
verified success also remains success when observed after the deadline. While a
run is live, removed owner/admin authority, delegation revocation, expired
deadline, stale/unretained source or lost Calendar authority stops planning/waits.
Changing fixed facts requires a new task/key, never an input response or reapproval
of different fields. Existing one-hour action-approval windows still apply even
when the hosted deadline is longer; inspect the run's action detail.

The response and create schemas match `finish-contract.md`; there are no new
browser fields. Model mode is deliberately a decision gate for this fixed plan,
not free-form synthesis: source/model cannot choose an assignee/date or create
different action text. Calendar-only model requests share fixed facts, no excerpt.

This is a bounded hosted service, not an arbitrary planner/DAG or a deployed/model
verification claim. Implementation/verification notes are finalized in
`finish-result.md` and the hosted service operations document.
