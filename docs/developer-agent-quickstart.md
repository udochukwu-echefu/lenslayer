# Agent assignment and developer quickstart

## Assign a hosted goal in the dashboard

Use **Agent tasks** (`/agent-tasks`) when LensLayer should prepare the proposals.
Use **Agents** (`/agents`) only for credentials supplied to your own server-side
SDK/MCP client. These share the existing scope, evidence, approval and verified
completion ledger; they are not separate execution backends.

1. Start/migrate the existing API and keep the agent worker lane running; sign in
   through the existing OIDC workspace session as an **owner or administrator**.
   Public preview remains clearly synthetic/read-only, not a hosted-task demo.
   An ordinary agent bearer cannot call these administration endpoints.
2. Select one explicit outcome: `retained-document-follow-up`, `calendar-event`,
   or `follow-up-and-calendar`. Document goals require an unexpired retained source,
   actual member assignee, literal phrase, exact title/optional description and due
   instant. Calendar goals require an active same-workspace encrypted OAuth
   connection and one of its originally granted exact owned-calendar IDs, exact
   summary and positive start/end interval ≤31 days. A calendar-only assignment
   delegates no document or assignee. Connect a calendar in Settings first.
3. Enter a human-authored goal and a future execution deadline ≤7 days away. All
   time controls require an ISO instant with `Z` or explicit `±HH:MM`; the browser
   never guesses a timezone. No identity/calendar ID/due date is inferred. The UI
   uses the latest retained source version; the API can accept an explicit
   `version_id` for API clients. Evidence fixes source identity at retrieval.
4. Default planning is **Fixed workflow · no model**: deterministic mapping of
   your facts into bounded typed proposals, not AI/legal interpretation. Optional
   model choice appears only when enabled by `/hosted-agent-capabilities`; its
   goal/facts/retained-excerpt sharing disclosure appears before selection, and
   submission requires explicit acknowledgement. Separate
   server product API access uses GPT-6.1 Sol/high, never subscription credentials.
   No model/provider call was run in this implementation pass.
5. Assign. Backend creates the exact internal delegation, always approval-required,
   expiring at the execution deadline. **No agent credential is accepted from or
   returned to the browser**. The 201 response means assignment recorded, not
   effects executed. `/agent-tasks/{task}` tracks metadata-only phase/status and
   the run link; Recent assignments lists up to 50. Open Runs for facts/evidence,
   immutable input, human approval and each exact read-back receipt.

Human endpoints are under `/api/v1/organizations/{org}`:

| Endpoint | Purpose |
| --- | --- |
| GET `/hosted-agent-capabilities` | `enabled`, `goal_types`, `planner_modes`, `max_deadline_days` |
| POST `/hosted-agent-tasks` | Strict idempotent human task request, 201/no-store |
| GET `/hosted-agent-tasks?limit=50` | Recent task status metadata |
| GET `/hosted-agent-tasks/{task}` | Durable assignment/phase and optional `run_id` |
| POST `/hosted-agent-tasks/{task}/cancel` | Stop new work, no rollback; no body |

The create payload uses **`assignee_id`**, not action `assigned_to_user_id`:

```json
{
  "idempotency_key": "persisted-unique-assignment-key",
  "goal_type": "retained-document-follow-up",
  "goal": "Create my explicit source-backed follow-up for human review",
  "deadline_at": "2026-10-12T12:00:00Z",
  "contract_id": "actual-retained-contract-id",
  "assignee_id": "actual-workspace-member-id",
  "due_at": "2026-10-30T09:00:00+02:00",
  "query": "notice",
  "task_title": "Review the source-backed follow-up",
  "task_description": "Human-authored fixed details",
  "planner_mode": "deterministic"
}
```

These IDs/dates are illustrative, not operational facts. Calendar-only requests
omit all document/task scope fields and add `calendar: {type:
"calendar_event_created",connection_id,calendar_id,summary,start_at,end_at}`.
Combined requests include both. Extra/irrelevant scope is rejected by the backend.
Human facts/title/description are preserved after schema normalization; source or
model output cannot override them. Run ownership is `lenslayer_hosted_agent`,
displayed separately from `external_agent`, with the planning method explicitly
labeled so hosted does not imply model-assisted.

`queued`, `planning`, `awaiting_input`, `awaiting_approval` and `running` are **not
success**. Only matching existing-run verified success closes a hosted task as
`succeeded`; combined goals need both named receipts. `failed`/`cancelled` can have
partial or unknown remote effects. Human facts and human approval remain separate
in Runs. Optional model planning can request a human boolean `confirm_plan`
through the existing input flow. Confirming resumes the same fixed facts; declining
ends planning. This factual input never approves an action. Cancellation does not
delete objects; uncertain Calendar writes require bounded read-back reconciliation,
not another insert.

The page freezes the original request and idempotency key on ambiguous submission.
It never automatically retries. Use **Retry identical assignment** or inspect
history; do not edit fields or generate another key for the same uncertain intent.
Only an authoritative 400/422 rejection offers editing. The in-memory key survives
a failed list refresh but is intentionally not stored in browser storage; if you
leave/reload or switch user/workspace/role, inspect history before reassigning.
Scope-keyed components abort requests and discard late responses on such switches;
server acceptance can still race an abort. Actual API authority is always checked.

The exact [hosted API reference](architecture/hosted-agent-api.md) agrees with these
routes and schemas. Model assistance is a bounded decision gate (`proceed`,
`needs_input`, `decline`), not free-form action synthesis. `needs_input` asks for a
human boolean `confirm_plan` in Runs; true resumes the original fixed plan, false
fails with `plan_declined`. Confirmation never replaces approval or edits facts.
An ambiguous charged call fails `model_outcome_unknown`, not an automatic model
retry. A completed run retains its matching terminal result on cancellation.

Backend implementation, dedicated agent lane/heartbeat and staging setup remain
platform/coordinator responsibilities. Do not treat frontend injected tests as
backend persistence, lease/concurrency, live provider or deployment verification.

## Bring your own server-side agent

Give a developer-run agent scoped source access, permission to create an internal
task, and a durable record of the verified outcome. The local implementation now
includes a packable SDK, official stdio MCP adapter, reference task-planner CLI,
hosted task assignment/status UI and a public guide at `/developers`. Nothing was
published or deployed by this work.
It does **not** execute submitted code, send renewal notices or handle a renewal.
The additive platform contract also supports exact Google Calendar event writes,
composite task/event conditions and factual input waits; OAuth/live provider checks
remain release gates. The reference CLI stays task-only; the hosted service contract
supports document, Calendar and combined bounded goals.

The first workflow is:

```text
External agent: create run -> retrieve retained evidence -> propose exact task
Human, if required: inspect source and immutable input -> approve or reject
LensLayer worker: create task -> read it back -> record verified completion
```

Success means **follow-up task created**, not **renewal handled**. LensLayer checks
source identity, persisted task fields, and optional caller-supplied date
arithmetic. It does not independently validate legal interpretation or confirm
that the person performed the follow-up.

## 1. Start the existing stack

Use the repository's Python environment and Node 24.15.0. From the repository
root, after installing `requirements.txt` and configuring the existing `.env`:

```sh
.venv/bin/python -m alembic -c backend/alembic.ini upgrade head
.venv/bin/python -m uvicorn backend.app.main:app --reload --port 8000
```

In another terminal, with the same database/storage configuration:

```sh
.venv/bin/python -m backend.app.worker
```

The API durably records proposals; the worker actually dispatches tasks and
closes expired runs/approvals. Keep it running, including while waiting for a
human. `--once` processes one worker pass, not a continuous service.

Start the dashboard separately:

```sh
cd dashboard
npm ci
PLATFORM_API_URL=http://127.0.0.1:8000 npm run dev
```

Use the existing authenticated workspace and OIDC setup described in
[`dashboard/README.md`](../dashboard/README.md). **Local identity headers do not
create a signed-in browser session.** Without that setup, signed-out visitors see
only the labeled synthetic public workspace, not your local executions. For an
API-only local check, use the existing human development headers below. Do not
disable authentication to make a demo appear real.

Normal document review may call the configured analysis provider. The disposable
test fixture at the end uses a stub analyzer and never calls a provider or sends
email.

## 2. Choose explicit scope and create a credential

Upload an agreement with **source-text retention enabled**, let its review finish,
and record its contract ID. Select an actual workspace member's user ID as the
assignee. Retrieval uses a literal case-insensitive phrase (2–200 characters),
not semantic search. Missing dates and recipient identity must come from explicit
user/developer input, never a fabricated example value.

As an owner/admin, open **Agents**, choose **Create agent**, and select:

- The retained contract(s) and permitted assignee(s).
- `documents.retrieve` and `workspace.tasks.create` for the first workflow.
- An explicit future credential expiry, at most 365 days away.
- An action limit, normally one.
- **Require human approval**, enabled by default.

The credential appears once. Copy it to a server-side secret manager or the
example's ignored `.env`, then dismiss the display. It clears on navigation,
tenant/role changes, page hiding, and dismissal. It never enters the dashboard
query/mutation cache. Your clipboard is not cleared automatically.

The token starts with `ll_agent_`. An ordinary user JWT or public contract API key
is **not** an agent token. The agent token does not authorize human workspace
routes and cannot approve its own action. Revocation is permanent and blocks
new work without deleting completed tasks.

Human creation request, relative to `/api/v1`:

```http
POST /organizations/{organization_id}/agents
Content-Type: application/json
Authorization: Bearer <human workspace access token>

{
  "name": "Renewal assistant",
  "allowed_tools": ["documents.retrieve", "workspace.tasks.create"],
  "contract_ids": ["your-contract-id"],
  "assignee_ids": ["your-workspace-user-id"],
  "require_approval": true,
  "expires_at": "2026-12-01T00:00:00Z",
  "max_actions_per_run": 1
}
```

The date is illustrative. Supply a future expiry for your execution. The 201
response is `{agent, token}` with `Cache-Control: no-store`. Never paste it into
issue reports, analytics, screenshots, or shared logs.

For **local API-only** provisioning, store that request body in
`examples/agents/.env.agent-create.json` with your real local IDs. Use one local
human identity consistently across workspace creation, upload, provisioning,
and approval. These headers are not a production authentication mechanism:

```sh
umask 077
curl --fail --silent --show-error \
  -H 'X-LensLayer-User: local-reviewer' \
  -H 'X-LensLayer-Email: reviewer@lenslayer.local' \
  -H 'Content-Type: application/json' \
  --data @examples/agents/.env.agent-create.json \
  -o examples/agents/.env.agent-response.json \
  "http://127.0.0.1:8000/api/v1/organizations/$LENSLAYER_ORGANIZATION_ID/agents"
```

Save only the returned token into the server-side example `.env`, then remove the
response file. `.env.*` files in the example are ignored (except `.env.example`).
Do not print the full response just to extract its ID. The non-secret agent list
can be read separately. In production, use a human OIDC session instead of local
headers.

## 3. Build the SDK and configure the example

The SDK is a local, dependency-free ESM TypeScript package, version 0.1.0, not a
published npm release. It has no runtime dependencies or framework requirements.
It uses `UNLICENSED`/all-rights-reserved terms pending rights-holder approval, not
an invented open-source grant. Use Node 20.3+ (validated with 24.15.0).

```sh
cd sdk
npm ci
npm run build
npm run release:check
```

For a server-side project outside the checkout, run `npm pack --pack-destination
/your/private/package-directory` in `sdk/`, then install the resulting
`lenslayer-agent-sdk-0.1.0.tgz`. The check tests the 18-file allowlist, credential
patterns, installed ESM exports and installed TypeScript declarations. It does
not publish. See [`sdk/README.md`](../sdk/README.md) and the
[release checklist](developer-release-checklist.md) for licensing/provenance gates.

From the repository root:

```sh
cp examples/agents/.env.example examples/agents/.env
chmod 600 examples/agents/.env
```

Edit that server-side file. Required values:

| Variable | Meaning |
| --- | --- |
| `LENSLAYER_AGENT_TOKEN` | The one-time scoped credential |
| `LENSLAYER_CONTRACT_ID` | A contract within that delegation |
| `LENSLAYER_ASSIGNEE_ID` | An explicitly permitted workspace user |
| `LENSLAYER_DUE_AT` | Exact task due instant, with `Z` or `±HH:MM` |
| `LENSLAYER_DEADLINE_AT` | Future execution deadline, no later than credential expiry |
| `LENSLAYER_RUN_KEY` | Persisted unique key for this intended run |
| `LENSLAYER_ACTION_KEY` | Persisted unique key for this task proposal |

Optional values include the API/dashboard URLs, `LENSLAYER_EVIDENCE_QUERY`
(default `renew`), a selected retained `LENSLAYER_VERSION_ID`, and polling timeout
(default five minutes). Supply `LENSLAYER_RENEWAL_DATE=YYYY-MM-DD` and
`LENSLAYER_NOTICE_DAYS` together or neither. They are caller-supplied facts, not
inferred from the receipt. Their arithmetic must match the due date's UTC date.

All date-time inputs require explicit timezones. The example normalizes them to
UTC and refuses missing factual inputs before any request. Omitting a version
selects the latest retained version; proposing/approving/dispatching a task with
stale evidence fails instead of silently changing the source.

Run the example from the repository root:

```sh
node --env-file=examples/agents/.env examples/agents/renewal-follow-up.mjs
```

It creates/replays a run, reads any existing action before retrieving new evidence,
proposes one task, prints non-secret run/action references, and polls to terminal
state. It neither prints source excerpts nor logs bearer credentials.

**Restart with the same keys and unchanged configuration.** The example reuses an
existing proposal and its evidence receipt. Retrieving a new receipt on every
restart would change the input bound to the action key. Changing input under the
same key returns a conflict; using a new key is not a safe retry. In generalized
workflows, every named condition reserves one immutable action: a different
action key cannot replace or duplicate that condition. Changed proposed input
requires a new authorized run.

## 4. Resolve human approval and inspect completion

The example prints a `/runs/{run_id}` dashboard link. In the correct authenticated
workspace, open **Runs** and inspect:

- Exact success condition, planning owner, deadline, tools, and budget.
- Target contract, assignee ID, due instant, retained evidence excerpt/version,
  offsets and source hash.
- Immutable task input, input SHA-256, approval expiry, and attempts.

An owner/admin enters a reason and selects **Approve exact task** or **Reject
task**. The proposal cannot be edited in place. Approval ends at the earlier of
the run deadline and one hour after proposal; dispatch rechecks its validity.
Expired approvals require a new run/action. Viewers/reviewers can inspect run
records but cannot approve, reject, cancel, or manage credentials.

For a local API-only check, get the action ID from the human actions endpoint and
resolve it using the same development identity:

```sh
curl --fail --silent --show-error \
  -H 'X-LensLayer-User: local-reviewer' \
  -H 'X-LensLayer-Email: reviewer@lenslayer.local' \
  -H 'Content-Type: application/json' \
  --data '{"decision":"approved","reason":"Checked source, scope, assignee, and exact due date."}' \
  "http://127.0.0.1:8000/api/v1/organizations/$LENSLAYER_ORGANIZATION_ID/agent-runs/$LENSLAYER_RUN_ID/actions/$LENSLAYER_ACTION_ID/approval"
```

With a worker running, the action moves through `queued`/`running` to a terminal
state. A successful run contains `verified=true`, `task_id`, `version_id`, and
`verification_method=database_read_back`. Inspect the task register and ordered
events too. Cancellation prevents new dispatch, not rollback; completed effects
remain visible.

## SDK usage and safe failure handling

Import `LensLayerClient` and wire types from the built local SDK on a server.
`createRun` and `proposeAction` take the same typed JSON inputs as the
[implemented API contract](architecture/agent-api-v1.md). There is no approval
method on the bearer client.

```ts
const run = await client.createRun(runInput); // includes your stable key
const receipt = await client.retrieveEvidence(run.id, {
  contract_id: contractId, query: "renewal notice",
});
await client.proposeAction(run.id, {
  idempotency_key: actionKey,
  tool: "workspace.tasks.create",
  input: {
    contract_id: contractId, assigned_to_user_id: assigneeId,
    title: "Review renewal notice deadline", due_at: dueAt,
    evidence_id: receipt.id,
  },
});
const completed = await client.pollRun(run.id, {
  deadlineAt: run.deadline_at, timeoutMs: 300_000,
});
for await (const event of client.iterateEvents(run.id, { limit: 100 })) {
  console.log(event.sequence, event.type); // metadata only
}
```

The SDK makes at most two automatic retries by default for network failures and
429/500/502/503/504 on reads or idempotent run/action creation. It reuses the same
serialized body and key. Evidence POSTs and cancellation are not automatically
retried. Redirects never receive the credential. HTTP requests have a 15-second
timeout, and `Retry-After`/backoff waits are bounded.

| State or failure | Meaning and response |
| --- | --- |
| `awaiting_approval` | Human decision required, not success; keep the worker running |
| `succeeded` with `verified=true` | Persisted internal task verified at completion |
| `failed` | Inspect `error_code`, actions, and events; do not assume no effects |
| `cancelled` | New dispatch blocked; existing completed tasks remain |
| HTTP 401/403 | Wrong/expired/revoked credential, scope, or human role; do not retry blindly |
| HTTP 404 | Missing resource or phrase; verify scope and shorten the literal query |
| HTTP 409 | Key/input conflict, stale source, deadline, approval, or budget; inspect first |
| HTTP 422 | Invalid typed input or date arithmetic; correct facts, not guessed values |
| `PollingStoppedError` | Local timeout or server deadline; not an automatic cancellation |

Durable codes include `approval_rejected`, `approval_expired`,
`deadline_exceeded`, `agent_inactive`, `delegation_denied`, `source_unavailable`,
`evidence_or_policy_expired`, `invalid_action`, and `retry_limit_exceeded`.
SDK errors expose safe HTTP status/details without retaining token-bearing fetch
exceptions. Never log config, environment, authorization headers, or secret files.

Event pagination uses a strictly increasing `after_sequence` cursor. The SDK
sorts and suppresses overlap, rejects stalled pagination, and limits a traversal
to 100 pages by default. Polling stops on terminal state, server deadline, caller
abort, authorization failure, or its own bounded timeout. An abandoned external
agent does not become a hosted autonomous runner.

## Calendar, composite conditions and factual input

These additions use the exact [platform interface](architecture/agent-interface-changes.md).
The unchanged task-only `createRun`/`proposeAction` routes remain available.
Shared reads can return task, calendar or composite records: discriminate success
condition `type` and action `tool`, never assume task fields on a calendar action.
The combined backend, SDK and real stdio MCP adapter have been checked together
against disposable API/worker fixtures. See the [integration verification](architecture/agent-pivot-integration-verification.md)
for results, including composite progress and uncertain provider-effect recovery.

An owner/admin can delegate `google_calendar.events.create` with exact
`calendar_targets: [{connection_id, calendar_id}]`. Calendar-only delegation may
leave `contract_ids` and `assignee_ids` empty. Each connection must have an active
same-workspace encrypted OAuth grant for the original owned calendar. The Agents
form accepts IDs and lets the API validate the pair. First open **Settings →
Google Calendar for agent actions**, enter the label and one owned calendar ID,
and continue to Google consent. On return, the same owner/admin explicitly completes
the connection. Use the returned connection ID and original calendar ID in Agents.
Reconnect creates a new connection ID and requires new delegation.

The human consent lifecycle is POST `/organizations/{org}/calendar/oauth/start`
with `{display_name,calendar_id}`, frontend redirect to returned `authorization_url`,
then POST `/calendar/oauth/callback` with `{state,code}` under the **same human**.
An exact redirect URI, provider client credentials and encryption configuration
must exist. Register exactly the dashboard origin plus `/calendar/oauth-return`
as the redirect URI. The UI clears the whole callback query before workspace/auth
loading, requests no-referrer/no-store headers, and keeps code/state only in memory.
Only workspace/user IDs and expiry are held in session storage. Suppress callback
URL/query logging at the hosting/reverse-proxy boundary and avoid third-party scripts.
State
is one-time even if exchange fails; restart consent rather than replay callback.
Disconnect is POST `/calendar/connections/{connection}/disconnect` with no body;
local execution is blocked before remote revocation, whose pending state is explicit.
Interrupted exchanges are not replayed; inspect existing connections and restart
consent. Disconnect retry reports pending provider revocation; existing events
remain. The UI and fake HTTP checks do not establish live Google consent/access.

SDK sequence for one independent event (all identifiers, dates and text must be
explicitly supplied facts, not model guesses):

```ts
const target = { connection_id: connectionId, calendar_id: calendarId };
const event = { type: "calendar_event_created" as const, ...target,
  summary, start_at: startAt, end_at: endAt };
const run = await client.createWorkflow({
  idempotency_key: runKey, goal: "Create the exact approved appointment",
  calendar_targets: [target], allowed_tools: ["google_calendar.events.create"],
  max_actions: 1, deadline_at: deadlineAt, success_condition: event,
});
await client.proposeToolAction(run.id, {
  idempotency_key: actionKey, tool: "google_calendar.events.create",
  tool_version: "1", input: { ...event, description },
});
```

Event duration must be positive and ≤31 days. This tool creates one private timed
event; no attendees, recurrence, arbitrary provider options or caller event ID.
Document provenance is optional but must pair `contract_id`/`evidence_id` with a
current same-run receipt and delegated retrieval. The operator displays the exact
connection, calendar, summary, start/end, description and input hash, using
**Approve exact event** / **Reject event**. Approval is not execution.
Calendar completion uses `verification_method=google_events_get` and exact
read-back fields/provenance. It certifies a snapshot, not perpetual existence.

For mixed outcomes, set `success_condition: {type:"all", conditions:[{id:"task",
condition: taskCondition},{id:"calendar",condition: event}]}`, delegate all required
resources/tools and set `max_actions` ≥ entry count (1–20 unique entries, no nesting).
Each corresponding tool input must carry its `condition_id`. Progress is
`result.completed_conditions`; one receipt is not whole-workflow success.

Between actions, call `requestInput(run.id, {idempotency_key,reason,fields,
expires_at,responder})`, with strict `text|date_time|integer|boolean` fields, up to
20, and no credential-like names. Expiry cannot exceed the unchanged run deadline.
Read history with `inputRequests`; supply `{values:{...}}` using `supplyInput`
only when `responder="agent"`. Owner/admin human supply uses the Runs view/human
route. Supply is recorded once; identical normalized values replay, changes 409.
It cannot edit success conditions, scope or immutable action input. Facts are
inspectable even on fresh terminal-run pages; events carry IDs, not supplied values.

| Additive state | Response |
| --- | --- |
| Run `awaiting_input` | Nonterminal wait; authorized factual supply, no new proposals |
| Action `unknown_outcome` / run error of that name | Remote event may exist; do not issue another write |
| `partial_effect=true` | A verified object may remain after cancellation/incomplete workflow; no rollback |
| Some `completed_conditions` | Partial progress, not success until all conditions have receipts |

Only an owner/admin may POST human run `/actions/{action}/reconcile` (no body)
for an eligible unknown calendar action. It enqueues bounded **GET-only** recovery,
never an insert, and does not reopen terminal runs. The operator exposes this as
**Request read-back reconciliation**. No deletion or compensation API exists.

## Local stdio MCP and bounded planner

Build MCP with `npm --prefix mcp ci` and `npm --prefix mcp run build`. Adapt
[`mcp/client-config.example.json`](../mcp/client-config.example.json) to the local
host, pointing Node at an absolute `mcp/dist/stdio.js` path. Provide the scoped
token only as a server-process secret. Direct Node invocation keeps stdout
protocol-only; metadata logs go to stderr. There is no hosted MCP URL or remote
OAuth service. Official SDK packages are pinned to 2.3.1; legacy initialize and
July 2026 discovery are both wire-tested. Discovery/calls check fresh allowed tools;
calendar-only grants do not expose task schemas. Human approval/reconciliation and
provider OAuth are never agent tools. See [`mcp/README.md`](../mcp/README.md).

There is no published `npx @lenslayer/...` install or remote LensLayer MCP URL.
For a local stdio host, the shape is illustrative and must be adapted to that
host's server-process secret mechanism:

```json
{
  "mcpServers": {
    "lenslayer": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/lenslayer/mcp/dist/stdio.js"],
      "env": {
        "LENSLAYER_API_URL": "http://127.0.0.1:8000",
        "LENSLAYER_AGENT_TOKEN": "<supply-via-private-host-secret>"
      }
    }
  }
}
```

Never commit a substituted token or paste it into a model prompt. The local MCP
directory currently depends on the sibling SDK checkout; it is not an independently
published artifact. Use the private SDK tarball for standalone SDK projects, and
keep both `sdk/` and `mcp/` for this source-installed stdio adapter.

Build `hosted-agent/` with `npm ci`/`npm run build`, supply actual explicit config
facts using [`config.example.json`](../hosted-agent/config.example.json), and run
`node hosted-agent/dist/cli.js /private/config.json /private/checkpoints/run.json`.
Missing facts return structured local input requests before API/model calls.
The typed planner is injected; a real Responses adapter requires separate product
API credentials and explicit opt-in, targets `gpt-6.1-sol` at high effort and has
no fallback. Tests never use product calls or OpenCode subscription credentials.
Checkpoint counters/IDs/config binding are atomic and credential/excerpt-free.
Restart with the same config/keys/checkpoint; observe the original ledger before
planning again. Approval waits do not replan. Default limits are one model call,
one evidence, one action, 60 seconds and 4 KiB plan output. No arbitrary text/tools
from a model enter the action; task text is fixed. The CLI is task-only, not a
hosted deployment or a calendar planner. See [`hosted-agent/README.md`](../hosted-agent/README.md)
for setup, model/data handling, lock recovery, ambiguous-evidence stops and limits.

## Verification without providers

Normal checks, with SDK build first:

```sh
cd sdk && npm test
cd ../examples/agents && npm test
cd ../../dashboard && npm run lint && npm test && npm run build
```

Also run `npm --prefix sdk run release:check`, `npm --prefix mcp test`,
`npm --prefix hosted-agent test`, and `npm --prefix landing run check` / `run build`.
Landing's lint script is `check`, not `lint`.

After the SDK, MCP and planner build, the repeatable combined check is:

```sh
make check-agent-integration
```

It creates private temporary databases, starts nonce-verified loopback API fixtures,
and runs the task example, actual MCP stdio, planner restart, calendar-only,
composite/input and uncertain-effect recovery flows. The worker is real; Google
HTTP and model choice are fake. It loads no real environment files or credentials,
does not write to Google, and stops its own services/removes its own data afterwards.
The CI workflow includes this runner, client suites and an explicitly disposable
loopback PostgreSQL service. A local pass does not assert a hosted CI result.

For an actual local HTTP/SQLite/worker round trip, choose a new temporary directory
outside customer data and use two terminals from the repository root:

```sh
export LENSLAYER_AGENT_TEST_ROOT=/absolute/path/to/a/new/disposable-directory
.venv/bin/python -m uvicorn \
  examples.agents.tests.local_backend:create_test_app \
  --factory --host 127.0.0.1 --port 8108 --no-access-log
```

In the second terminal, set that same directory:

```sh
export LENSLAYER_AGENT_TEST_ROOT=/absolute/path/to/a/new/disposable-directory
export LENSLAYER_TEST_PYTHON=/absolute/path/to/your/.venv/bin/python
LENSLAYER_AGENT_TEST_API_URL=http://127.0.0.1:8108 \
  node examples/agents/tests/verify-local-backend.mjs
LENSLAYER_AGENT_TEST_API_URL=http://127.0.0.1:8108 \
  node mcp/tests/local-backend-smoke.mjs
```

This uploads and extracts a TXT fixture using a stub analyzer, checks approval
before dispatch, runs the real worker, verifies task fields/provenance, tests
idempotent replay, paginates events, checks revocation, and exercises the runnable
example. The fixture loads no `.env`, makes no model/provider call, and sends no
email. It leaves only non-secret UI references in `ui-records.json`; all database
and object data are disposable. This is a local integration check, not production
OAuth, PostgreSQL locking/load validation, or an external connector guarantee.
The second check adds official real stdio -> API -> approval -> real worker/task
read-back, then an injected typed planner -> same API/worker with an on-disk
restart. It proves no duplicate tasks or replanning, not real-model quality or
the additive calendar provider integration. For strict isolation, run the fixture
and scripts under `env -i PATH="$PATH"` plus only the documented fixture variables;
set `PYTHONPATH` to the snapshot root when starting uvicorn from a disposable cwd.

## Integration notes for the backend owner

- `sdk/src/types.ts` mirrors the shipped `agent_schemas.py`; the dashboard imports
  only those types through `src/lib/agent-types.ts`. Update this shared contract
  when backend fields/states change. Lists are arrays, not invented page envelopes.
- The dashboard uses human organization routes through the existing transport.
  Agent bearer calls exist only in the server-side SDK/example. Evidence review
  uses the newly shipped human `GET .../evidence/{evidence_id}` endpoint on demand.
- Event pages advance from the greatest received sequence and suppress overlap.
  Run lists expose up to 100 newest records because there is no older-run cursor
  in v1. Terminal run transitions also refresh actions/events to get final receipts.
- Credential creation is not idempotent and is never automatically retried. The
  form aborts on unmount, but warns that the server may still create a delegation
  whose unsaved credential should be revoked. Mutation cache data contains only
  the returned agent metadata, never `{agent, token}`.
- The platform proxy now returns `private, no-store` and logs no upstream
  exception object that might contain credentials.
- The original v1 SQLite fixture may return task-list dates without a timezone;
  its check interprets those legacy values as UTC. The additive platform contract
  normalizes those responses to aware UTC; the SDK/result dates remain aware.
- Existing OIDC login is reused, not replaced. Browser integration verification
  can use a disposable locally signed test session; that is not a live OAuth test.
  SDK publication, hosted deployment, live MCP host configuration and external
  provider/model round trips remain release gates. Calendar consent UI is implemented;
  deployed callback/log configuration and live consent are still external checks. Local stdio
  MCP and the local bounded planner are implemented, not deployed services.
