# Agent generalization interface (bounded v2)

This is the backend/developer integration contract, additive to the verified v1
API. Paths are relative to `/api/v1`; all timestamps require a timezone. No SDK,
MCP, hosted model, UI or deployment changes are part of this implementation.

## Private, versioned context

Human workspace membership is required to read; owner/admin is required to write.
Agent bearers cannot use human routes. No public/share/export route exposes notes.

| Route | Input / response |
| --- | --- |
| `POST /organizations/{org}/context-records` | `{title, text, expires_at}` → 201 `ContextRecordResponse` |
| `GET /organizations/{org}/context-records?limit=50` | `ContextRecordResponse[]` (metadata only) |
| `GET /organizations/{org}/context-records/{record}` | `ContextRecordResponse` |
| `POST /organizations/{org}/context-records/{record}/versions` | `{expected_version, text}` → 201 `ContextRecordResponse` |
| `GET /organizations/{org}/context-records/{record}/versions/{version_number}` | `{id, record_id, version_number, source_sha256, text, created_at}`; number starts at 1 |
| `DELETE /organizations/{org}/context-records/{record}` | 204; tombstone, erase all retained version text |
| `POST /organizations/{org}/agents/{agent}/context-scope` | `{context_ids}` → `AgentResponse`; narrowing only |

`ContextRecordResponse`: `id, organization_id, title, current_version,
expires_at, deleted_at, created_at`. Retention is mandatory (future, ≤365 days),
immutable and cannot be extended. Text is ≤100,000 characters. Version writes use
optimistic concurrency; expiry/deletion makes all version/evidence reads fail.
Like other strict API string inputs, leading/trailing whitespace is trimmed before
storage. Evidence hashes and offsets refer to this validated retained string, not
the pre-validation submission or UTF-8 byte offsets.
Worker retention sweeps erase expired text; source hashes/IDs remain as receipts.
Metadata tombstones remain. Caller-supplied task titles, descriptions and search
queries are separate retained workflow data; deletion does not erase those or
purge database backups. Notes are never automatically copied into event payloads.

`AgentCreate`/`AgentResponse` gain default-empty `context_ids`; tools gain
`context.retrieve` and `workspace.context_tasks.create` version `1`. Delegations
can name only explicit same-organization records. Narrowing immediately blocks
retrieval, approval and dispatch for removed records, including old runs.

## Immutable graph creation

`POST /agent/workflow-graphs` → 201 `AgentRunResponse`. Input:

```json
{
  "idempotency_key": "customer-follow-up-1",
  "goal": "Create the approved assigned follow-ups (not perform them)",
  "context_ids": ["record-id"],
  "deadline_at": "2026-10-15T12:00:00Z",
  "nodes": [
    {
      "id": "follow-up",
      "depends_on": [],
      "not_before_at": "2026-10-14T14:00:00Z",
      "when": {"fact": "needs_follow_up", "value": true, "equals": true},
      "task": {
        "context_id": "record-id",
        "query": "customer onboarding",
        "assigned_to_user_id": "member-id",
        "title": "Follow up on onboarding",
        "description": "Contact the assigned customer owner.",
        "due_at": "2026-10-16T12:00:00Z"
      }
    }
  ]
}
```

1–20 unique nodes, acyclic dependencies, no unknown/self/duplicate edges. Every
node is an assigned context-backed follow-up; mixed Calendar/contract graphs are
not supported. Scope and plan are immutable. Node count must fit delegated action
budget. Deadline is ≤29 days, within delegation and every scoped record's expiry.
Not-before must precede deadline. Task due date is a business field, not an
execution timer. Each action's approval window is still at most one hour from
proposal and bounded by deadline; scheduled execution must fit that window when
approval is required. Longer scheduled waits require a new run, never automatic
approval renewal.

Creation atomically retrieves evidence, creates the run and **all original action
IDs/output IDs**. Use existing actions/events/cancel/approval/read routes. Retries
with identical graph input return the original run; changed input returns 409.
No graph mutation, new action insertion or automatic replanning is allowed.
The context write tool is graph-only: existing `/actions` and `/tool-actions`
proposal routes do not accept it. A one-node graph is the standalone follow-up API.

The new success condition is `{type:"graph", nodes:[{id, condition}]}`; each
condition is `{type:"context_task_created", context_id, assigned_to_user_id,
title, description, due_at}`. Run responses add default-empty `context_ids`.
Action input adds a closed `ContextTaskActionInput` union member:
`condition_id, context_id, assigned_to_user_id, title, description, due_at,
evidence_id, plan_sha256, when` (nullable), and `type:"context_task_created"`.
Predicate is boolean equality only:
`{fact, value, equals}`. Values are caller-supplied factual assertions, **not**
inferred truth from a note. Branches require per-action human approval; approval
hash binds factual value, predicate, task input, evidence and whole plan hash.
Both `value` and `equals` accept only JSON `true`/`false`; strings, numbers,
null and containers return 422 without creating a run/action/evidence.
No expression language, eval, submitted code or self-approval exists.

Dependencies resolve only on verified completion or an approved false branch.
A false node becomes `skipped`; it does not create a task or count as completed.
Children may run after skipped dependencies (use their own explicit predicates
for alternatives). True nodes execute no earlier than not-before. Approval is
not readiness: queued blocked/future actions consume no attempts or idle CPU.
Not-before gates task dispatch, not evaluation of an approved false predicate;
false nodes may be skipped as soon as their dependencies and approval resolve.

`GET /agent/runs/{run}/graph` and
`GET /organizations/{org}/agent-runs/{run}/graph` return
`{run_id, plan_sha256, nodes:[{id, action_id, depends_on, not_before_at, status}]}`.
Node status: `blocked | ready | completed | skipped`; terminal failed/cancelled
run status takes precedence over unfinished node status.

Run result: `{type:"graph", verified, completed_nodes:{node:{action_id,result}},
skipped_node_ids:[...]}`. Success means all applicable exact task fields and
provenance were independently database-read-back verified, or a node was skipped
by its approved factual predicate. It does **not** mean the follow-up was performed
or an unrelated business goal was achieved. An all-false graph has no task effects.
Each completed `result` is `{type:"context_task_created", task_id, contract_id:null,
context_id, assigned_to_user_id, due_at, evidence_id, version_id, plan_sha256,
node_id, verified:true, verification_method:"database_read_back", verified_at}`.
Recovery checks these historical receipt bindings against the original action,
evidence and plan, not just status or a verified flag. A mismatched receipt fails
with `invalid_completion_receipt`; no new task or approval is generated.

## Retrieval and events

`POST /agent/context-search` accepts `{context_ids, query, max_results:5}` and
returns `{context_id, version_id, source_sha256, start_offset, end_offset, excerpt}[]`.
This read-only planning search works before a run exists, rechecks current scoped
delegation, and creates no evidence receipts/actions. Graph creation independently
retrieves and binds current evidence; planning hits cannot authorize a write.

`POST /agent/runs/{run}/context-evidence` input
`{context_ids, query, max_results:5}` → `ContextEvidenceResponse[]`.
Explicit IDs must be subsets of both immutable run and current delegation scopes.
Lexical AND search supports 1–10 distinct Unicode word terms; no external search,
embedding/model service or arbitrary workspace-wide search. Results rank by
smallest covering span then stable record ID, within a bounded excerpt window.
Receipt budget is the existing configured per-run budget.
Bounds: 1–100 unique explicit IDs, query 1–200 characters, max_results 1–10.
All terms must fit within a 3,400-character source span; excerpts add up to 300
characters on each side (at most 4,000 total). No match returns 404; invalid terms
return 422. The configured remaining receipt budget may truncate result count.

`GET /agent/runs/{run}/context-evidence/{evidence}` and the corresponding human
`/organizations/{org}/agent-runs/{run}/context-evidence/{evidence}` return
`{id, context_id, version_id, source_sha256, start_offset, end_offset, excerpt,
created_at}`. Offsets index original Python Unicode source text; full-source
SHA-256 is UTF-8. Receipts/events/provenance contain no copied excerpts. Writes
require the latest retained version at creation, approval and dispatch; evidence
reads may inspect older retained versions. Agent evidence reads recheck scope.
Dispatch revalidates retained source/policy after task read-back, inside the task
savepoint and before the success fence; expiry during read-back rolls back the task.

New events: `context.evidence_retrieved` (IDs/hash), `graph.created`
(plan hash/node IDs), `graph.node_ready` (node/action IDs), `graph.node_skipped`
(node/action IDs), `graph.checkpoint` (completed/skipped IDs). Existing
`action.proposed/approved/rejected/succeeded/failed` and terminal run events remain.
Exact new event data:

| Event | Data |
| --- | --- |
| `context.evidence_retrieved` | `{evidence_id, context_id, version_id, source_sha256}` |
| `graph.created` | `{plan_sha256, node_ids}` |
| `graph.node_ready` / `graph.node_skipped` | `{node_id, action_id}` |
| `graph.checkpoint` | `{completed_node_ids, skipped_node_ids}` |

Skipped actions retain their original ID and approval, with `status:"cancelled"`,
`error_code:"branch_false"`, no verified effect receipt and zero dispatch attempts.
Workspace audits additionally use `context.created`, `context.version_created`,
`context.deleted`, `agent.context_scope_narrowed`, `agent.graph_created`, and
`agent.graph_checkpointed` for a nonterminal completed action (not run success).

## Durable execution boundary

Graph dispatch reuses stable task output IDs, principal→run→action locks,
immutable approval hashes, expiring leases, fenced atomic task/receipt commits
and bounded retries. Recovery reconstructs readiness from committed node/action
receipts; no new IDs or approvals are generated. The on-demand wake selector
uses only dependency-ready timers plus approval/delegation/resource/run expiry.
Empty/future/blocked graphs do not start a polling/model loop. Cloud Tasks calls
remain existing bounded wake scheduling, not live-tested here.

## Changes since the early developer handoff

- Added **`POST /agent/context-search`** late so scoped retrieval is usable before
  deciding an immutable action plan. Its hits have no receipt ID/created_at and
  cannot authorize writes; graph creation creates independent durable evidence.
- Version reads use a positive **version number** in the route, not a version UUID;
  responses/evidence still identify the immutable version by UUID.
- Explicitly documented the default `type:"context_task_created"` action field,
  graph-only write proposal boundary, exact receipt/event shapes and skip status.
- Review added `invalid_completion_receipt` on forged/mismatched graph completion
  receipts. No additional route or caller input is required for this check.
- Final review proved strict JSON boolean rejection and added post-read-back
  source/policy revalidation before the task success fence. No API input changed.
- Notes expire/deletion erases retained source version text, not caller-supplied
  action/plan/task text, tombstone metadata or database backups.

No other SDK/MCP/dashboard/deployment integration changes are owned here.
