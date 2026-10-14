# Workspace context and bounded workflow graphs

Implemented against the refreshed `coordination/generalization-interface.md` and
its two schema snapshots. Backend/deployed acceptance is coordinator-owned. SDK
0.1.0 is still **unpublished**; SDK-only MIT and the exact 18-file reviewed-artifact
release path are unchanged. This guide is source documentation, not npm contents.

## Source and delegation

An owner/admin adds a private brief in **Workspace context**, with mandatory
retention of at most 365 days. Members can read; owners/admins can version/delete.
Version writes use `expected_version`; on 409, reread/review the current version.
Version reads use a **positive version number**, not a version UUID. Retention is
immutable; there is no retention-extension route. Deletion erases all retained
version text, but not tombstones, hashes, caller-supplied plan/task text or backups.
Expiry blocks reads; worker retention sweeps erase expired source text.

Delegate explicit `context_ids`, real `assignee_ids`, `context.retrieve` and
`workspace.context_tasks.create`. Both tools use **string version `"1"`**; bounded
v2 is additive under `/api/v1`, not a `/v2` route or a version-2 tool. Narrowing
is removal-only and immediately blocks retrieval/approval/dispatch, including old
runs. There is no agent-supplied org selector, credential input or self-approval.

## Planning search is not evidence

```ts
const hits = await client.searchContext({
  context_ids: [authorizedContextId], query: "customer onboarding", max_results: 5,
});
```

This pre-run lexical AND search returns `ContextSearchHit[]`: context/version IDs,
full-source SHA-256, offsets and excerpt. **No evidence ID or created_at exists.**
Hits cannot authorize a write. Graph creation independently retrieves current
evidence and binds it durably to each original action. All context content is
untrusted data, never instructions, permission or inferred boolean truth.

Search takes 1–100 unique explicit scoped IDs, 1–10 distinct Unicode word terms,
query length 1–200, max_results 1–10 (default 5). Terms must fit a 3,400-character
source span; excerpts add up to 300 characters per side, at most 4,000 total.
No match returns 404, invalid terms 422. No embedding/model/external search occurs.

## Immutable graph example

```ts
const input: WorkflowGraphCreate = {
  idempotency_key: persistedKey,
  goal: "Create assigned Northstar IT follow-up tasks, not perform them",
  context_ids: [authorizedContextId], deadline_at: explicitDeadline,
  nodes: [
    { id: "review", depends_on: [], not_before_at: explicitStart,
      when: {fact: "needs_follow_up", value: true, equals: true},
      task: {context_id: authorizedContextId, query: "customer onboarding",
        assigned_to_user_id: actualMemberId, title: "Review the onboarding handoff",
        description: "Confirm the assigned support owner.", due_at: explicitDue} },
    { id: "alternative", depends_on: ["review"],
      when: {fact: "needs_follow_up", value: true, equals: false},
      task: {context_id: authorizedContextId, query: "support owner",
        assigned_to_user_id: actualMemberId, title: "Prepare the alternative handoff",
        due_at: explicitDue} },
  ],
};
const run = await client.createWorkflowGraph(input);
const original = await client.graph(run.id);
```

Supply actual authorized IDs, explicit facts and timezone-aware dates, not these
illustrative variable names. The source-installed CLI accepts that exact JSON:

```sh
node examples/agents/context-graph.mjs /absolute/private/path/to/graph.json
```

Supply `LENSLAYER_API_URL` and `LENSLAYER_AGENT_TOKEN` through the server process
environment only. No environment file is loaded implicitly. The CLI submits/replays
once and reads the original graph; it prints IDs/states, not goal/source/token.
It performs no model call, polling loop, approval or action insertion.

Graphs have 1–20 unique nodes, known acyclic dependencies, context-only tasks and
an immutable action budget. Creation atomically fixes **all original action and
output IDs**. Reuse identical input/key after an uncertain response; changed input
returns 409. No later action insertion/replanning is allowed. A one-node graph is
the standalone context-task API; old `/actions` and `/tool-actions` do not accept
the context creation tool. There is no human graph-create route or browser bearer.

`when` is strict boolean equality: `{fact,value,equals}`. A fact has one immutable
value throughout the plan. No expressions, eval, strings-as-booleans or inferred
truth. Every branch requires human approval. An approved false branch is skipped,
not completed: its original action is `cancelled`, `error_code:"branch_false"`,
zero attempts, no verified effect receipt. Children may proceed after skipped
dependencies and need their own intended predicates.

`not_before_at` is earliest execution; `due_at` is a business field, not a timer.
The deadline is at most 29 days, inside delegation and every scoped record expiry.
Approval lasts at most one hour from proposal and never beyond deadline. A longer
scheduled wait needs a new reviewed run, not automatic approval renewal. Blocked
and future graphs must sleep, not poll/run models or consume dispatch attempts.
This client starts no worker. Worker operation is coordinator-owned.

## Read retained proof and actual progress

```ts
// Optional receipt-budget mutation, not a replay requirement and never auto-retried:
const receipts = await client.retrieveContextEvidence(run.id, {
  context_ids: [authorizedContextId], query: "customer onboarding", max_results: 5,
});
const proof = await client.readContextEvidence(run.id, receipts[0].id);
```

Receipt IDs belong to a run and current delegation. Offsets index the validated,
trimmed original **Python Unicode characters**, not JavaScript UTF-16 or UTF-8
bytes. Full-source SHA-256 uses UTF-8. Older retained versions may be read; writes
require the latest version at creation, approval and dispatch. Remaining receipt
budget can truncate results. Expiry/deletion blocks all source/evidence reads.

Every new SDK method freshly checks known version-1 grants. Graph create/read
requires both context tools; search/evidence requires retrieval. Missing versions,
numeric `1`, unknown versions, revocation and narrowing fail closed. Graph and
search bodies are snapshotted before discovery/retries. Read-only search can use
bounded retries; budget-consuming evidence retrieval cannot. Closed input checks
reject org/token/code fields. Search/evidence and graph response checks reject
receipt/hit confusion, malformed fields, cross-scope hits and unknown node states.
API ownership, budget and expiry checks remain authoritative.

Read graph states as `blocked | ready | completed | skipped`; terminal failed or
cancelled run status takes precedence. Success result is `{type:"graph",verified,
completed_nodes:{node:{action_id,result}},skipped_node_ids}`. Each completed result
is `ContextTaskReceipt`: `type:"context_task_created"`, task ID, **contract_id:null**,
context/assignee/due/evidence/version/plan/node bindings, `verified:true`,
`verification_method:"database_read_back"`, `verified_at`. The UI checks those
original bindings rather than trusting a bare verified flag. Backend recovery can
fail `invalid_completion_receipt`; do not create replacement tasks to bypass it.
Task creation is **not business follow-up performed**. An all-false graph has no
task effects. Cancellation never promises rollback of already-created tasks.

## Exact expected routes/types for coordinator reconciliation

All paths below are relative to `/api/v1`:

| Method | Route | Input → response |
| --- | --- | --- |
| GET | `/agent/tools` | `AgentTool[]` |
| POST | `/agent/context-search` | `ContextSearch` → `ContextSearchHit[]` |
| POST | `/agent/workflow-graphs` | `WorkflowGraphCreate` → 201 `AgentRun` |
| GET | `/agent/runs/{run}/graph` | `WorkflowGraph` |
| POST | `/agent/runs/{run}/context-evidence` | `ContextSearch` → `ContextEvidenceReceipt[]` |
| GET | `/agent/runs/{run}/context-evidence/{evidence}` | `ContextEvidenceReceipt` |
| GET | `/organizations/{org}/context-records?limit=50` | metadata-only `ContextRecord[]` |
| POST | `/organizations/{org}/context-records` | `ContextRecordCreate` → 201 `ContextRecord` |
| GET | `/organizations/{org}/context-records/{record}` | `ContextRecord` |
| POST | `/organizations/{org}/context-records/{record}/versions` | `ContextVersionCreate` → 201 `ContextRecord` |
| GET | `/organizations/{org}/context-records/{record}/versions/{version_number}` | `ContextVersion` |
| DELETE | `/organizations/{org}/context-records/{record}` | no body → 204 |
| POST | `/organizations/{org}/agents/{agent}/context-scope` | `ContextScope` → `Agent` |
| GET | `/organizations/{org}/agent-runs/{run}/graph` | `WorkflowGraph` |
| GET | `/organizations/{org}/agent-runs/{run}/context-evidence/{evidence}` | `ContextEvidenceReceipt` |

Existing human agent create, actions/events/cancel/approval routes are reused.
`AgentCreate`, `Agent`, `AgentRun` gain default-empty `context_ids`; success/action
unions gain `GraphSuccessCondition`/`ContextTaskActionInput`. Older `/workflows`
inputs remain task/calendar/composite only. No skipped workspace-task status is
invented. Task response schema was not supplied: context task links use only an
actual string `source_reference.context_id` in the existing provenance map; without
it the task is unlinked. Coordinator must confirm that provenance field.

Snapshot schema names map to exported TS types: `ContextRecordResponse` →
`ContextRecord`, `ContextVersionResponse` → `ContextVersion`,
`ContextEvidenceResponse` → `ContextEvidenceReceipt`, `GraphResponse` →
`WorkflowGraph`, `GraphNodeResponse` → `GraphNode`. Input names match snapshots.
Additional exports: `ContextSearchHit`, `ContextTaskReceipt`, `GraphResult`,
`FactualPredicate`, `ContextGraphEventData` (documented ID/hash-only event payloads).

No deployed provider, tenant isolation, worker persistence or actual interactive
OpenCode host acceptance is claimed by fake-API/React tests. See `mcp/OPENCODE.md`
for coordinator-owned host acceptance and `DISTRIBUTION.md` for registry gates.
