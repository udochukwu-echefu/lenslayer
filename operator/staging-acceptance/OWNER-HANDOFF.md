# Owner-ready staging handoff (supersedes the manual JSON entry workflow)

The wrappers are qualified offline; live results are recorded separately in the
dated acceptance record. Root prepares the nonsecret command/path. The human starts it in Terminal **before clicking
Create**, then pastes only the fresh bearer at `Fresh credential (hidden):`.
There is no JSON to assemble, no environment variable containing a bearer, and
no second confirmation prompt. No helper creates or revokes a credential.

## SDK: one hidden paste

Use the existing approved Python environment with locked `psycopg[binary]` 3.2.10
available and Node 24.15.0 on PATH. This task did not install dependencies. Existing
gcloud managed authentication must already have access to the one pinned staging
DB secret; do not log in or create credentials as part of the command.

Root creates an owned mode-0700 progress directory once, and provides actual
existing org/context/assignee UUIDs in this command. Example from workspace root:

```sh
mkdir -m 700 operator/staging-acceptance/private-progress
python3 -B operator/staging-acceptance/coordinator_handoff.py sdk \
  --org ORG-UUID --context CONTEXT-UUID --assignee ASSIGNEE-UUID \
  --wait-seconds 180 \
  --progress "$PWD/operator/staging-acceptance/private-progress/sdk-fresh-01.jsonl"
```

Use an unused absolute progress filename each time; existing files/symlinks are
not overwritten. Do not put a bearer into an argument, file or shell command.
The explicit progress file is mode 0600 and contains only validated, reconstructed
redacted JSON. Stdout mirrors those same records; stderr contains the fixed
getpass prompt only. Unknown CLI arguments are never echoed (even if a human
accidentally puts a bearer there). The wrapper rejects getpass's echoing fallback.

1. `waiting_for_credential` means the fresh-after fence is recorded **now**. Owner
   can click Create in the existing UI. Scope remains exactly the existing form's
   two tools `context.retrieve` + `workspace.context_tasks.create`, one context,
   one assignee, max one action, approval required, no contracts/Calendar targets.
   Expiry must be at most one hour **from credential creation**. Create no run.
2. Paste only the newly displayed bearer at the hidden prompt and press Enter.
   Python getpass restores terminal state on success and catchable interruption.
   The wrapper fetches **only** Secret Manager
   `projects/lenslayer/secrets/lenslayer-staging-neon-pooled-url/versions/1`
   through existing gcloud managed auth, with stdout captured only in memory.
   No OAuth, model, signing, connector or other secret is fetched in SDK mode.
3. The parameterized PostgreSQL lookup uses **SHA256(token)**, exact requested org
   and creation-at/after the wrapper fence. It explicitly begins `READ ONLY`,
   checks `SHOW transaction_read_only = on`, and sets transaction-local statement,
   lock and idle transaction timeouts. These settings are applied inside the
   transaction because the Neon pooler rejects the corresponding startup options.
   Ambient `PGSERVICE`/`PGSERVICEFILE` selection is rejected. It returns only the exact
   fresh principal, delegator membership role and run count; duplicate/no/old/
   revoked/long-lived matches fail closed. No prefix scans or old bearer recovery.
   The existing observer checks the full exact scope and expiry before HTTP.
4. The wrapper pipes its in-memory envelope directly to the actual existing Node
   SDK observer's stdin. Neither the token nor DB URL goes into child argv/env,
   progress files, stdout or stderr. The child cannot be redirected to another
   HTTPS service: the observer now pins the exact origin
   `https://lenslayer-api-staging-th7nw37zha-ew.a.run.app`.
5. Root monitors the explicitly supplied JSONL path. Only after
   `baseline_positive`, root revokes **that emitted fresh agent ID** in the existing
   owner UI. The observer continues automatically with GET-only SDK polls. It
   does not propose/approve/dispatch/replan actions or change the form/queues.
6. `denial_observed` is emitted only after validated SDK 401/403 evidence and a
   successful observer exit. Root then independently reads revocation metadata,
   unchanged expiry, org/agent identity, retained membership and zero runs. The
   denial alone does not prove revocation causality. Use the existing separate
   post-denial query in `scope-readback.sql`; do not select a verifier again.

Observer wait is 1–600 seconds (default 180); expiry checks retain the safety
margin, five-second HTTP timeout and zero SDK retries. A wrapper-wide ten-minute
alarm also bounds waiting for the owner plus inspection/observation. If it fires,
or any inspection fails, the finding is incomplete: no automatic new credential,
retry, revocation, action or graph repeat. Never reuse the completed graph's old
revoked/expired bearer. SIGKILL/power loss cannot guarantee terminal cleanup.

## Calendar: coordinator-only pinned-secret callable/command

Root's separately recorded live check at **15:22:43 UTC on 15 October 2026**
read the existing event through the renewed grant and observed natural refresh
with revision CAS **0 to 1**. Independent read-only metadata at **15:25:19 UTC**
confirmed the old grant remains revoked/revision 2/empty payload, and new
`75a57c6d-2b10-4b25-9a4c-a96658ff4abe` is active/revision 1. The existing pinned
event and disposable calendar are unchanged. There is no new grant, event POST,
revocation/retry, force-expiry edit, action, approval or dispatch path.

The existing runtime's `require_connector_config` guard needs five existing
Calendar secret refs and one **public literal** redirect setting:

- `google_calendar_client_id`
- `google_calendar_client_secret`
- `connector_encryption_key`
- `connector_state_signing_key`
- `calendar_session_binding_key`

The public `google_calendar_redirect_uri` is exactly
`https://lenslayer-dashboard-staging.udboy361.workers.dev/calendar/oauth-return`.
It is **not a secret reference** and is never fetched from Secret Manager.
Together with the fixed DB secret above, this is **six existing pinned reads**.
No model/email/storage/OIDC secret or provider grant token is fetched from Secret
Manager. State/session keys are required by the existing decrypt/encrypt guard;
the wrapper does not replace them with synthetic/development keys to bypass it.

Root supplied actual names-only deployment metadata in
`calendar-runtime-coordinates.json`. The wrapper accepts that exact schema:
`secret_refs` (exactly the five fields listed above), public
`google_calendar_redirect_uri`, fixed `database_secret`, and `observed_revision`.
Secret IDs are pinned to `lenslayer-staging-` plus each field's hyphenated name,
project `lenslayer`, version **1**; the recorded revision is
`lenslayer-api-staging-00007-hrc`. Extra refs (including an invented redirect
secret), other versions/projects, altered redirect, missing fields, duplicate
names or symlinks fail closed. This file is nonsecret deployment metadata,
**not human-entered credential JSON**. No secret values are read during tests.

```sh
python3 -B operator/staging-acceptance/coordinator_handoff.py calendar \
  --org ORG-UUID --pins-file /private/tmp/lenslayer-finish-20261015-15bdv_aa/staging-acceptance/calendar-runtime-coordinates.json \
  --wait-seconds 0 --ack existing-staging-grant-get-only-runtime-cas \
  --progress /private/tmp/lenslayer-finish-20261015-15bdv_aa/staging-acceptance/operator/staging-acceptance/private-progress/calendar-read-01.jsonl
```

The command is also callable as `calendar_handoff(args, sink)` inside root's
dedicated authorized process. It loads pins with gcloud in memory, builds an
initializer-only Settings subclass (ignoring `.env`, secret directories and
ambient product configuration), and constructs only the existing DB engine.
It never creates schemas, applications, workers or user sessions. Legacy dotenv
import side effects are suppressed. Current connection metadata supplies the
calendar ID in an explicit read-only query; personal IDs are not CLI arguments
or output. `calendar_renewal.py` then enforces the existing calendar hash/event/
action/input/old-and-new-connection pins and exact product event readback.

Natural refresh, **only if due**, invokes the unchanged existing runtime
`_usable_tokens` and its encrypted revision-CAS persistence, preserving any
rotated refresh token. That CAS is the only authorized persistence exception to
read-only inspection; never use a strictly read-only DB role and silently drop
the replacement token. No separate token exchange or forced-expiry path exists.
If not due, successful GET reports refresh **false**, not fabricated renewal.
Optional natural wait is 0–300 seconds; DB connect timeout is ten seconds,
provider timeout five seconds, and the wrapper has a ten-minute total alarm.

Only validated booleans/revisions/timestamp are output. Findings do **not** imply
independent Google API inspector ownership/count proof, equal account subjects,
or exhaustive browser/session/log acceptance. On any failure, stop and inspect;
do not retry an uncertain refresh/rotation or revoke either grant. Managed gcloud
auth must already exist. The live renewal check above does not qualify the
separate SDK revocation or independent Calendar inspector checks.

## Independent inspector: raw token only, no product-grant access

Root prepares a **new absolute owned mode-0700 progress directory** for this
attempt, and a new 0600 file is created exclusively inside it (same rule for all
three modes). The human pastes only an already-authorized independent Google
read-only access token at the real hidden getpass prompt; no token JSON/files,
argv, environment, logs or shell commands:

```sh
mkdir -m 700 operator/staging-acceptance/inspector-progress-01
python3 -B operator/staging-acceptance/coordinator_handoff.py inspector \
  --org ORG-UUID --ack owner-witnessed-existing-independent-readonly-grant \
  --progress /private/tmp/lenslayer-finish-20261015-15bdv_aa/staging-acceptance/operator/staging-acceptance/inspector-progress-01/receipt.jsonl
```

Root/owner must externally witness that the token comes from an **existing
independent OAuth project** (a Playground-owned OAuth client is permitted, not a
product-project client) with `calendar.calendarlist.readonly` plus
`calendar.events.owned.readonly`. Existing `calendar.events.readonly` also permits
the fixed inspection GETs. This is not authorization to create a grant or run a
token exchange. Opaque tokens are **not introspected** and project/scope provenance
is **not inferred** from successful GETs. Same-account subject equality remains
explicitly unproved.

Inspector mode fetches only the fixed version-1 DB secret. It reads the exact
completed action/run and **old** connection's calendar metadata inside an enforced
read-only transaction, checks immutable input/approval hashes, stable output/
event ID and old-connection/run/action/calendar provenance, then pipes the assembled
in-memory envelope to existing `calendar-inspector.mjs`. It does **not** select
encrypted provider credentials, access the new product connection, refresh,
revoke, write events, dispatch actions, or create anything at Google.

The actual Node inspector issues only its three fixed-origin Google GETs and
checks CalendarList ownership, exact event fields and exactly one event. Child
output is capped at 8 KiB/25 seconds, validated and reconstructed before a
redacted receipt is written; hostile extras, duplicate receipts, false boundary
claims, nonzero exit, invalid/oversized output or interruption never qualify.
Product renewed-grant qualification, same-subject equality and production session
binding remain false. Independent inspector success does not replace those gates.

## Regression evidence and frozen history

```sh
node --test operator/staging-acceptance/acceptance.test.mjs
python3 -B -m unittest discover -s operator/staging-acceptance -p 'test_*.py' -v
```

Tests use fake managed-secret/DB/HTTP boundaries, not live services. The new real
PTY test pastes **only a synthetic bearer** into actual getpass, pipes the
automatically inspected envelope to the actual SDK observer with injected fetch,
and checks positive baseline, pre-expiry denial, redaction and terminal restoration.
SIGINT/SIGTERM PTY cases check catchable interruption. The earlier real Node TTY
`readableFlowing=null` regression and cleanup fix remain unchanged.

`RESULT.md` and `verification.json` remain frozen historical artifacts. Their
old source hashes do **not** qualify the newly origin-pinned observer/test bytes.
`HANDOFF-RESULT.md` and `handoff-verification.json` are also frozen historical
artifacts. **Current** corrected source identities/results are in
`HANDOFF-FINAL.md` and `handoff-final-verification.json`. Independent review of the earlier candidate remains
separate; no review findings or new live passes have been assumed.
