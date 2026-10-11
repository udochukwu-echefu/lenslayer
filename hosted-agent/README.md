# Hosted assignment and reference planner client

The user-facing assignment experience is now **Agent tasks** in the dashboard:
`/agent-tasks` and `/agent-tasks/{task}`. Owners/admins choose explicit document
follow-up, Calendar event or combined goals, track queued/planning/input/approval/
execution statuses and open the existing run ledger for approvals and receipts.
No credential is accepted from or returned to that browser. The server creates
the exact internal, always-approval-required delegation, ending at the task deadline.

The hosted service belongs to the existing Python API/worker and durable database
task/claim/checkpoint implementation, **not this TypeScript file store**. The shared
contract is `finish-contract.md`; platform owns hosted runtime/tests and service
docs. Human endpoints are organization `/hosted-agent-tasks` (create/list/read/
cancel) and `/hosted-agent-capabilities`. Optional model choice is capability-gated
with explicit goal/facts/retained-excerpt disclosure; deterministic planning is an
honest fixed workflow, not a model. Both use human-authored fixed facts and the
same approval/fenced action/read-back ledger. Nothing was deployed by this work.

## Reference external-client CLI

The CLI below remains runnable for developers studying the bearer API and
bounded planner boundary. It is **not** the server-hosted worker and does not
extend the hosted service to arbitrary goals. Its fixed task content/local file
checkpoints differ deliberately from the hosted assignment contract's exact
human-authored title/description and database leases.

A server-side CLI over the **same scoped agent API**. No direct database/task
executor, backend stack replacement, arbitrary code, agent self-approval, calendar
planning or general autonomous agent. The existing FastAPI API and worker remain
the infrastructure. The only supported goal is `retained-document-follow-up`.

## Build and run

```sh
npm --prefix sdk ci
npm --prefix sdk run build
npm --prefix hosted-agent ci
npm --prefix hosted-agent run build
```

Copy `config.example.json` to a private config outside source control. Add actual
`contractId`, `assigneeId`, `dueAt` (aware ISO instant), and `deadlineAt` (future,
within delegation expiry). Missing fields produce an allowlisted
`{state:"awaiting_input",fields:[...]}` before an API/model call. Do not use fake
dates/identities as operational facts. Optionally add `versionId` and paired
`renewalDate`/`noticeDays`; their calendar-day arithmetic must match dueAt's UTC date.

Create an approval-required credential with both task tools and exact document/
assignee scopes. Retain source text. Keep the API and worker running. Provide only
server-side `LENSLAYER_API_URL` and `LENSLAYER_AGENT_TOKEN`, plus a **separate product
API key** if opting into model calls. Never use OpenCode subscription credentials.

```sh
node hosted-agent/dist/cli.js /private/path/config.json /private/path/checkpoints/run.json
# Or explicitly load a private env file you created for this product:
node --env-file=/private/path/product.env hosted-agent/dist/cli.js /private/path/config.json /private/path/checkpoints/run.json
```

The command returns metadata-only JSON states/IDs and exits. Awaiting approval,
queued and awaiting input are waits, not success. Resolve exact input through the
human Runs dashboard/API; run the **same command/config/checkpoint** later to
observe completion. Do not change the keys, source, facts or limits on restart.
The backend validates delegation independently of planner reasoning.

## Planner/model separation and budgets

`Planner` is a typed injectable interface; infrastructure receives unknown output,
then validates a strict `Plan`. Plans can select `task`, `needs_input` or
`unsupported` and cite a literal span, but cannot name new tools, set action text,
change facts, approve or execute. Task title/description are fixed infrastructure
strings; source/model text is never copied into a task or checkpoint. Dates and
assignees come from explicit caller facts, not inference. A relevant literal span
is grounding evidence, **not** independent validation of contractual meaning.

`OpenAIPlanner` is a real configurable Responses REST adapter, schema-constrained
with local validation, explicit `gpt-6.1-sol`, high effort, `store:false`, output
token cap, redirect refusal and safe generic failures. No default model fallback.
Construction/calls require `LENSLAYER_PRODUCT_MODEL_ENABLED=true` and a separate
`LENSLAYER_PRODUCT_MODEL_API_KEY`. Real calls send the retained excerpt to that
provider: obtain data-processing consent and review provider retention terms;
`store:false` is not a universal zero-retention claim. No real model call was run.
Adapter reference: https://platform.openai.com/docs/guides/structured-outputs

Defaults: one model call/iteration, one evidence receipt, one action, 60 seconds,
4 KiB planner output, 1,024 adapter output tokens. Upper limits: three model calls,
one evidence/action, 300 seconds, 16 KiB plan and 64 KiB model response envelope.
No reasoning/tool loop. Calls are charged durably **before** invocation; failures
do not trigger hidden retries. The planner and API requests honor abort/deadline
signals. The planning deadline persists across restarts; approval waiting causes
no new planning, and observation uses a fresh bounded read window.

## State and prompt-injection boundary

Retrieved text/tool output is untrusted data, never policy or permission. System
policy is separate from serialized source input. Runtime constraints enforce exact
goal/tool/success fields and fixed action content regardless of planner obedience.
This does not certify that a real model interprets every clause correctly.

Checkpoints contain schema version, config hash, opaque run/evidence/action IDs,
call count, phase, deadline and proposal-ready flag. No bearer, product key, source
excerpt, raw model output, raw error or copied task prose. Files are 0600, directory
0700, atomic write/fsync/rename. The CLI takes an exclusive local lock. A stale
lock after a process crash is intentional: confirm its recorded PID is dead and
no runner uses that checkpoint before removing **that exact lock**, then restart.
Do not share this file store across distributed hosts; use an equivalent leased
store preserving the interface if deploying later.

Run/action retries reuse the original stable keys. Before replanning, inspect the
original ledger. Saved evidence is re-read; a saved proposal can be rebuilt from
fixed facts without storing source text. An ambiguous evidence POST stops with
`uncertain_evidence_receipt` because v1 has no receipt-list/idempotency API; it
never silently creates another receipt. Inspect/cancel that run if no receipt ID
can be recovered. Changed config is refused, not silently bound to an old action.

`needs_input` after retrieval is a local checkpoint state. The new platform typed
input routes are available through SDK/MCP/operator UI, but this task planner does
not broaden its success condition or mutate configuration under the same key to
consume them. A source-context request needs explicit review; close the original
run and start a newly scoped/configured one if facts or source must change. Existing
server `awaiting_input` is reported as a wait. Calendar/composite and unknown remote
effects stay outside this planner's goal limits.

## Deterministic evaluation, not model-quality benchmarking

```sh
npm --prefix hosted-agent test
```

Coverage: grounded proposal; unsupported goal; missing input and date arithmetic;
malicious source/tool output; separate model/evidence/action/time/output budgets;
invalid planner output; model failure/refusal/truncation; approval waits and exact
verified receipts; ambiguous run/action/evidence responses; safe on-disk restart;
credential-free checkpoints and locks; adapter request/response boundaries through
injected fetch. The disposable HTTP/SQLite/worker test verifies infrastructure
effects with a fake typed planner, not a fake database.

Not evaluated: real-model accuracy, adversarial prompt corpus performance, cost,
latency, provider retention, legal reasoning, production/OIDC, distributed state,
live calendar access or remote writes. Those are explicit release gates.
