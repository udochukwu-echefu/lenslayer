# Production provider activation and positive acceptance

Public-source audit of `7e2955faac10004d6c004a5dacfc04295ab00670`, checked
2026-10-17, with the subsequently human-approved **USD 1 total DeepSeek pilot**
implemented in source. This is an operator handoff, **not activation,
Google verification, or evidence of live success**. The release operator owns private configuration,
human approvals and live checks. No OpenAI API access is needed for this procedure.

## 1. Choose the workflow before enabling a provider

| Path | Supported outcome | Provider dependency |
| --- | --- | --- |
| Hosted fixed workflow (`deterministic`) | Retained-document follow-up, Calendar-only event, or both | No model; Calendar only for event outcomes |
| Hosted model assistance (`model`) | The same three fixed-fact outcomes | DeepSeek decision gate; cannot author or change action facts |
| External server-side context graph | 1–20 immutable context-backed task nodes, dependencies, explicit boolean branches and not-before times | No product model or Calendar integration in this graph path |

Hosted forms do **not** accept Workspace context records. They take a retained
contract/version, literal phrase, real member assignee, exact title/description and
due time; Calendar-only delegates no document or assignee. The execution deadline
is future and at most seven days, distinct from due/event times. Combined goals
require two separately approved, verified effects. Calendar events are single,
private, timezone-aware timed events of positive duration up to 31 days; no
attendees, recurrence, conference, attachments or arbitrary provider options.

Model assistance is currently only `proceed | needs_input | decline` over a
human-authored plan, not open-ended planning. `needs_input` asks a human to confirm
that exact plan; it does not authorize dispatch. External context graphs are also
fixed plans, not a hosted context-model planner. Search hits alone are not evidence;
graph creation independently binds evidence. Every effect still needs approval.

Sources: [hosted schema](../../backend/app/hosted_agent_schemas.py),
[form](../../dashboard/src/components/agents/hosted-task-form.tsx),
[fixed plan](../../backend/app/hosted_agent_plan.py),
[external example](../../examples/agents/context-graph.mjs),
[graph contracts](../../sdk/GENERALIZATION.md).

## 2. DeepSeek: configuration, admission and sequence

All backend names below have the prefix `LENSLAYER_PLATFORM_`. Apply consistent
configuration to **API and on-demand agent worker**, using separately provisioned
server-side product credentials, never a subscription/session credential.

| Suffix | Current requirement/default |
| --- | --- |
| `HOSTED_AGENTS_ENABLED` | `true` for assignments |
| `HOSTED_MODEL_ENABLED` | Default `false`; root activates the approved pilot separately |
| `HOSTED_MODEL_PROVIDER` | Explicit `deepseek`; default unset |
| `HOSTED_MODEL_API_KEY` | Separate nonblank, whitespace-free product API secret |
| `HOSTED_MODEL_LIFETIME_CALL_LIMIT` | Default `0`, validated **0..3**; set `3` for this approved pilot (existing admissions count) |
| `HOSTED_MODEL_LIFETIME_USD_LIMIT` | Finite Decimal, default `0`, range `0..1.00`; set explicitly to `1.00` for the approved **total**, no refill |
| `HOSTED_MODEL_TIMEOUT_SECONDS` | Default/max `30`, minimum `1` |
| `HOSTED_MODEL_MAX_OUTPUT_TOKENS` | Default `2048`, range `1..4096` |
| `HOSTED_AGENT_LEASE_SECONDS` | Default `180`, range `30..600`; must exceed `3 * model timeout + 15` |

Registry fixes `deepseek-flash` (DeepSeek V4.1 Flash), high reasoning effort,
`https://api.deepseek.com/responses`; no configurable model/endpoint, retry,
redirect, tools or provider fallback. Requests are capped at 32,768 bytes;
responses at 65,536 bytes; one strict decision text at most 512 characters. Goal,
scoped facts and at most 1,000 retained-excerpt characters are shared. No raw model
output/reasoning is retained by the adapter; **this is not a provider zero-retention
promise**. DeepSeek's stateless Responses API does not support `store` as a request
control; the adapter correctly omits it.

Official [pricing](https://api-docs.deepseek.com/quick_start/pricing/) and
[2026-09-10 release](https://api-docs.deepseek.com/news/news260910/) currently name
`deepseek-flash`, not legacy aliases. Published Flash USD per million tokens:

| Tokens | Peak | Off-peak |
| --- | ---: | ---: |
| Input, cache hit | 0.006 | 0.003 |
| Input, cache miss | 0.30 | 0.15 |
| Output | 1.20 | 0.60 |

Published context is 1M, provider maximum output 384K, concurrency 2,500; these
are **not** LensLayer allowances. Peak is weekdays 01:00–04:00 and 06:00–10:00 UTC,
excluding Chinese public holidays; other times off-peak. Recheck prices before
authorizing spend. The code conservatively burns USD `0.319488` per admission:
`1,048,576 * 0.30 / 1e6 + 4,096 * 1.20 / 1e6`. It assumes peak cache-miss pricing,
not discounts or actual billed usage. No search/fetch tools are enabled.

**Both limits must be explicitly nonzero** as well as model enabled and provider
DeepSeek. Three lifetime admissions reserve **USD 0.958464**; the remaining
USD 0.041536 cannot admit a fourth. This is the total global allowance, not USD 1
per task, organization, release or day. Any earlier valid burned reservations
already consume it. A smaller cap is exact: USD 0.638976 admits at most two;
anything below USD 0.319488 admits none. Disabled settings safely default to zero;
constructing enabled settings alone does not enable admission.

### Current exact sequence and limitations

1. Owner/admin reads hosted capabilities. Model mode/disclosure appears only when
   key/config and remaining durable admission permit it. Capabilities are not a
   provider connectivity check; production creation does not call model discovery.
2. Human explicitly chooses model mode and checks context-sharing consent in the
   form. Request pins expected provider/model/high effort. The UI checkbox is a
   submission gate, not a separate persisted consent field; preserve the reviewed
   disclosure/version and operator consent evidence. A changed selection is rejected.
3. Creation fixes request/selection hashes and, in the same durable transaction,
   reserves the global lifetime allowance. Replaying the identical key/input
   returns the original task, not a new reservation. Changed input returns 409.
4. Worker creates a bounded internal delegation/run, retrieves retained evidence
   for document goals, then commits `model_calls=1`, state `charged` and the
   `hosted.model_charged` event **before** HTTP. It rechecks authority, source,
   configuration, budget binding and lease before/after HTTP; no DB lock spans it.
5. `proceed` proposes only the fixed actions; `needs_input` waits for
   `confirm_plan=true`; `decline` fails. Human owner/admin approves each immutable
   action input separately in Runs. Dispatch and independent read-back establish
   completion, never the model decision or assignment response.

The existing counter `global-product-model-v1` and reservation ledger have no cascading task
FK. Reservation is burned even if no HTTP occurs, consent is declined, an assignment
is cancelled or deleted, or the provider fails. No refunds, reset, expiry or fallback.
Charge/crash uncertainty recovers as `model_outcome_unknown`, never another paid
request. `OPENAI` exists in the registry but is not admitted by this budget gate.
Evaluation scripts have a separate evaluation ledger; they are **not** production
budget admission and must not be run to prove product acceptance.

### Bounded pilot admission and billing distinction

The pilot extends only the call range and adds the explicit Decimal USD ceiling;
it uses the **same counter, budget ID and durable ledger without a migration**.
Under the global-row transaction, every historical reservation must match the
original USD 0.319488, provider/model/high selection hash and token bounds, and
the counter must exactly equal ledger count. Missing/inconsistent/unknown history
fails closed for capability, creation and pre-dispatch validation. Monetary
capacity is calculated with Decimal arithmetic and enforced in the counter's
atomic update predicate alongside the call limit; no SQL floating-point sum is
used. Existing reservations are never reset, refunded or silently repriced.

Lowering either ceiling below already-reserved totals blocks new admissions and
in-flight model dispatch; disabling/changing provider does not release history.
If history is inconsistent, stop and escalate to root; do not delete a row, create
a new budget ID, restore an older database, or change an amount to regain capacity.
This guards application behavior, not privileged destruction of both counter and
all ledger history; durable database/backup controls remain essential.

**A reservation is a conservative capacity burn, not a claim of an actual invoice.**
It happens before provider HTTP and remains spent even when no call occurs.
Actual provider billing may be lower and is not recorded/reconciled by this pilot;
discounts, actual usage or unused output do not refund admission. Keep the one-call
per-task/no-uncertainty-retry policy, fixed human facts, evidence, approvals,
read-back receipts and on-demand idle behavior. There is no automatic refill,
renewal, recurring/multi-customer billing or actual-usage accounting. Exhaustion
ends the pilot; a broader production service needs a new human decision and
separately reviewed implementation, not an operational counter reset.

Sources: [settings](../../backend/app/config.py),
[registry](../../backend/app/hosted_model_providers.py),
[protocol](../../backend/app/hosted_model_protocol.py),
[adapter](../../backend/app/hosted_agent_model.py),
[admission](../../backend/app/hosted_model_budget.py),
[service](../../backend/app/hosted_agent_service.py),
[runtime](../../backend/app/hosted_agent_runtime.py),
[official Responses guide](https://api-docs.deepseek.com/guides/responses_api).

## 3. Google Calendar: human credential handoff and consent

Root/human must select the authorized Google project (no project/client ID is
inferred here), enable Calendar API, configure Google Auth Platform branding,
audience and Data Access, and create an OAuth **Web application** client. Register
the exact redirect `https://app.lenslayer.online/calendar/oauth-return`, not the
backend POST endpoint, Auth0 callback or old workers.dev origin. Hand the client
secret directly into approved secret storage, never source, chat, browser bundles
or acceptance logs. Confirm domain ownership, support/developer contacts, public
home/privacy policy and applicable Google user-data policy disclosures.

Google `calendar.events.owned` means see/create/change/delete events on calendars
the consenting account **owns**. It is broader than the app's one-calendar
allowlist: the app narrows to the exact supplied calendar ID. It is not generic
shared-calendar editor access, Calendar-list access or Google-account identity
verification. The operator must choose an actually owned disposable calendar and
copy its explicit ID; there is no ownership/calendar-list discovery in this code.
OAuth completion stores `provider_account_verified=false` and
`calendar_ownership_verified=false`; connected/configured does not prove an event
can be created. Only dispatch/read-back proves this operation.

External **Testing** is limited to listed test users (up to 100); Calendar refresh
grants expire after seven days. A controlled test-user acceptance is not general
production readiness. For public availability use the appropriate In production
audience/publishing state and complete sensitive-scope/brand verification unless
a documented exception applies. Publishing is not itself verification. An
organization-owned Internal app is only for that Workspace/Cloud Identity
organization and may still need admin approval; an "internal synthetic task"
does not make an external OAuth app Internal. Google verification/Workspace policy
decisions are unavoidable human/provider steps; do not claim them from code.

Backend prefix remains `LENSLAYER_PLATFORM_`:

| Suffix | Required value/handling |
| --- | --- |
| `GOOGLE_CALENDAR_ENABLED` | `true` (default `false`) on API and agent worker |
| `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` | The human-created Web client, secret server-side only |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Exact HTTPS app callback above, no query/fragment |
| `CONNECTOR_ENCRYPTION_KEY` | Valid Fernet key; protect/persist to decrypt existing grants |
| `CONNECTOR_STATE_SIGNING_KEY` | Separate secret of at least 32 characters; its hash binds OAuth configuration |
| `CALENDAR_SESSION_BINDING_KEY` | Separate HMAC secret of at least 32 characters; distinct from encryption/state/model keys |
| `CONNECTOR_HTTP_TIMEOUT_SECONDS` | Default `5`, range `1..10`; bounded 65,536-byte responses |

Dashboard server requires the **same** HMAC value as `CALENDAR_SESSION_BINDING_KEY`,
canonical HTTPS `NEXTAUTH_URL=https://app.lenslayer.online`, `PLATFORM_API_URL` equal
to the authorized HTTPS API origin, and working existing NextAuth/OIDC server
session configuration (`AUTH_OIDC_ISSUER`, `AUTH_OIDC_CLIENT_ID`,
`AUTH_OIDC_CLIENT_SECRET`, `AUTH_OIDC_AUDIENCE`, `NEXTAUTH_SECRET`; optional display
name `AUTH_OIDC_NAME`). These are separate from Google Calendar OAuth credentials.
None is `NEXT_PUBLIC_*`. Keep keys stable: changing client
ID/encryption key strands encrypted grants; session key rotation changes session
fingerprints; client/redirect/state-key changes invalidate pending consent.

### Actual browser/server/provider sequence

1. Same signed-in workspace owner/admin starts in Settings → Integrations with
   display name and exact owned-calendar ID. Same-origin JSON POST with Calendar
   CSRF header reaches the dashboard BFF, not an arbitrary bearer client.
2. BFF reads the trusted server session and signs a 60-second, one-use HMAC proof
   bound to subject, organization, operation, body digest and login fingerprint.
   Backend validates it and creates a 10-minute, one-use opaque provider state
   (at most 20 pending per organization).
3. Google consent requests **only** `calendar.events.owned`, `access_type=offline`,
   `prompt=consent`, `include_granted_scopes=false`. Human signs in to the chosen
   owning account and grants access. No Google login scope/account ID is requested.
4. Return page scrubs code/state from URL, keeps them only in memory, checks the
   initiating human/workspace and requires **Complete connection**. BFF generates
   a fresh proof; backend requires the same login fingerprint/configuration and
   consumes state before token exchange. Logout/new login requires fresh consent.
5. Backend exchanges at Google's token endpoint, requires the exact scope set,
   Bearer access token and refresh token, then encrypts credentials bound to
   organization/connection/client ID. No tokens enter public records. Interrupted
   exchange is not automatically replayed: inspect connections, restart consent.
6. A separate assignment/delegation and each event-action approval are still
   required. Worker refreshes tokens on demand (expiry within 30 seconds), persists
   refresh via revision fencing, and rechecks grant/approval/source/deadline.
   It persists stable event intent, GETs the ID, records dispatch before insert,
   inserts with `sendUpdates=none`, then GET-verifies exact fields/provenance.
   Once dispatch began, uncertain recovery is GET-only, never a blind replacement POST.

No invitations or reminders: intent has no attendees and sets
`reminders.useDefault=false`. Disconnect locally revokes immediately; Google
revocation may remain pending. Revocation/cancellation is not deletion or rollback
of an already-created event; the connector has no event-delete UI/API here.
Suppress OAuth URL/query/code/state, proofs, token/model bodies and authorization
headers in ingress/application/wire/SQL logs. Do not capture them as evidence.

Sources: [OAuth service](../../backend/app/service_domains/calendar.py),
[connector](../../backend/app/calendar_connector.py),
[session verifier](../../backend/app/calendar_session.py),
[BFF](../../dashboard/src/app/api/calendar/[organizationId]/[...operation]/route.ts),
[browser callback](../../dashboard/src/components/calendar-consent-return.tsx),
[resource allowlist](../../backend/app/agent_resources.py),
[dispatch](../../backend/app/calendar_runtime.py).
Official: [Web server OAuth/credential creation](https://developers.google.com/identity/protocols/oauth2/web-server),
[Calendar scopes](https://developers.google.com/calendar/api/auth),
[sensitive-scope verification/exceptions](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification),
[publishing/test users](https://support.google.com/cloud/answer/10311615),
[refresh-token expiry](https://developers.google.com/identity/protocols/oauth2).

## 4. Deployment persistence: current rollout will undo activation

`scripts/prepare-production.py` validates a closed manifest/secret list and renders
`HOSTED_MODEL_ENABLED=false`, lifetime limit `0`, `GOOGLE_CALENDAR_ENABLED=false`.
Its API/worker deployments use replacement `--env-vars-file` and `--set-secrets`
without optional provider secrets. `deploy/gcp/cloudbuild.yaml` likewise replaces
env/secrets, disables the model and omits Calendar settings (defaults disabled).
The pinned `cloudbuild.release.yaml` only builds; it does not preserve or activate
providers. **Do not activate once manually and assume the next release preserves it.**

Before durable activation root needs a reviewed renderer/manifest and build-path
change with explicit optional-provider settings and pinned secret-version
references, consistent API/worker selection, and disabled defaults when omitted.
Verify rendered output and post-deploy configuration metadata without exporting
values. Dashboard server-secret bindings must also survive its deployment path.
No such code/config change is made by this audit. Keep `on_demand`, private worker
invocation, zero minimum instances, bounded drain/queue and recovery; do not follow
older "supervise continuously" guidance for this production lane.

Freshness findings for the documentation owner: `docs/deployment/hosted-agent-service.md`
still claims OpenAI-only selection, twice-timeout lease and continuous supervision;
current code uses the explicit registry, **three** timeouts plus 15 seconds and
on-demand production. Historical evaluation results are not current production
acceptance. This guide does not modify those other documents.

## 5. One positive production task: exact synthetic internal acceptance

**Recommended ordinary flow:** a one-node external context graph, avoiding document
extraction/model spend, email and Calendar. The release operator supplies the scoped server bearer;
it never enters browser/arguments/logs. This demonstrates creation of a follow-up,
not performance of a business follow-up. Do not count a rejected request or an
all-false/skipped graph as the positive outcome.

1. Human creates one retained Workspace context record titled
   `Synthetic production acceptance — no business data`, retention 3 days, text:
   `SYNTHETIC LL-ACCEPT-001. Create one internal follow-up to inspect this synthetic acceptance receipt. No email, invitations, customer data or external action is authorized.`
   Capture actual organization/context/latest-version IDs, source SHA-256 and
   retained text/offset proof through authorized UI/API. Assign to the initiating
   real owner/admin's workspace member ID, not a fabricated user.
2. Freeze an execution sheet with actual IDs, one persisted idempotency key,
   `deadline_at=2026-10-18T12:00:00Z`, `due_at=2026-10-18T11:00:00Z`. If these are
   no longer future, the human chooses and records replacement UTC instants
   **before first submission**, within retention/delegation; never edits a replay.
   Delegate only this context/assignee and `context.retrieve` /
   `workspace.context_tasks.create` version string `"1"`, require approval, one action.
3. Submit once using the [context graph example](../../examples/agents/context-graph.mjs):
   goal `Create one synthetic internal acceptance follow-up`; one node `receipt`,
   `depends_on:[]`, no branch or not-before delay, task query `SYNTHETIC LL-ACCEPT-001`,
   exact title `Inspect synthetic production acceptance receipt`, description
   `Internal acceptance only. No email, invitations or business action.`, and the
   recorded context/assignee/due time. Preserve the complete immutable JSON/key;
   repeat only identical input/key after uncertainty. Graph creation atomically
   fixes original run/action/output IDs and independently retained evidence.
4. In Runs, capture the proposed action, tool/version, input hash, context/version/
   evidence bindings, exact title/description/due/assignee, and **no task effect
   before approval**. Owner/admin explicitly approves with reason
   `Approve one synthetic internal follow-up only; no external communication.`
   Record approver, approval timestamp/expiry and approved input hash. Approval is
   at most one hour from proposal and bounded by deadline; do not auto-renew it.
5. Allow the normal authenticated wake/dispatch. Read original run, graph, action,
   evidence and resulting workspace task. Require exactly one completed node and
   one task, no skipped node; run/action succeeded and receipt
   `type=context_task_created`, `verified=true`,
   `verification_method=database_read_back`, timestamp and matching task/context/
   assignee/due/evidence/version/plan/node bindings. Independently inspect task
   fields: `contract_id=null`, open follow-up, normal priority, exact text and
   creator. Preserve dispatch/action events, not just a success screenshot.
6. Re-read with the original key/IDs: no duplicate task/action or changed facts.
   Revoke the disposable delegation after completion. Record task remains an
   internal created task; cleanup is a separate human decision, not ledger reset.
7. Idle evidence: before assignment, while waiting for approval, and after terminal
   completion record sanitized queue/worker state and timestamps. Confirm bounded
   drains stop, no busy polling/model calls, worker min=0/private invocation and
   eventual zero instances. Account for the configured hourly recovery wake; do
   not demand zero requests forever or treat an idle heartbeat as a failure.

For **hosted fixed-workflow** acceptance instead, use a separately authorized
synthetic retained document with the same marker, select
`retained-document-follow-up` / `deterministic` and explicit source/member/facts
in the hosted form, then approve and verify the document-backed receipt
(`workspace_task_created`, `database_read_back`, contract/version/source/evidence
bindings). Upload/extraction may use the separate document processing lane;
do not assume it is model-free. Context graphs are not evidence that this hosted
form path was exercised.

### Separate provider acceptance gates (do not conflate them)

- **Model-assisted:** only after root's spend decision and available reservation,
  use one synthetic hosted document/fixed plan with explicit sharing consent.
  Record explicit call/USD limits (`3` / `1.00` for this pilot), all pre-existing
  reservations, and remaining capacity; do not assume three fresh calls.
  Record disclosure and expected/actual `deepseek/deepseek-flash/high`, task/request/
  selection bindings, global reservation before/after, single charge event and
  accepted decision state, any human confirmation, per-action approval and verified
  task receipt. Prove no fourth lifetime admission (or earlier admission over a
  smaller cap), no replay charge and
  no calls at idle. A reservation/charge alone is not provider success. Current
  product adapter does not expose actual token usage/cost; the release operator must reconcile
  separately with sanitized provider billing evidence, not assert a measured cost.
- **Calendar:** use a disposable explicitly owned calendar, human OAuth completion
  and **deterministic Calendar-only** assignment, exact summary
  `Synthetic LensLayer acceptance — no attendees`, start
  `2026-10-18T10:00:00Z`, end `2026-10-18T10:05:00Z`, execution deadline
  `2026-10-18T09:00:00Z`, within seven days (human updates all instants before first
  submit if needed). Preserve
  connection/exact calendar grant, consent/publishing classification, proposal/hash,
  approval, stable provider event ID, dispatch intent/event and authoritative
  `google_events_get` verified receipt. Read back exact summary/description,
  UTC times, private visibility/provenance, disabled reminders, no attendees,
  recurrence/conference/attachments, and `partial_effect=false`. Inspect the same
  event in Google Calendar as additional human evidence. Refresh after natural
  access-token expiry requires a separately approved second event; never edit
  encrypted expiry rows to manufacture production renewal evidence. Disconnect
  after disposable acceptance and record any pending provider revocation. Cleanup
  of the event/calendar is human-owned and separate from historical receipts.

**Release evidence envelope:** exact reviewed commit/image digest and API/worker/
dashboard revision IDs; migration-to-head result; canonical-origin/OIDC owner/admin
checks; sanitized configuration/secret-version references (no values); human spend
and OAuth approvals; execution sheet and immutable IDs/hashes; source evidence;
per-action approval; dispatch and read-back receipts; duplicate/idle checks; actual
times, outcomes and unresolved/partial effects. Broader repeatability, OAuth public
verification and deployment persistence remain gates until their evidence exists.

The old workers.dev app retirement is root/other-worker work, not done here.
The current `dashboard/wrangler.jsonc` still has `workers_dev:true`; canonical
OAuth/NextAuth origins must not depend on that old address. No marketing website
or launch-video work is part of this procedure.
