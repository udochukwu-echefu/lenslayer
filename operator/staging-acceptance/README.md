# Remaining staging acceptance: coordinator handoff

**Offline implementation/preflight only. No live service was contacted.** These
tools do not close live acceptance gates until the coordinator runs them under
separate existing authorization and retains dated, source-bound results.

## Nonnegotiable boundaries

- Never recover/reuse the old graph credential or rerun graph
  `61a7a27d-b5e8-4736-aa11-b235d0c4d92f`. Two tasks and the no-effect false skip
  are already proved; only a fresh credential's pre-expiry denial remains open.
- No create/replan/action/approval/dispatch calls, model calls, queue changes,
  cloud changes, new OAuth grants, Calendar event writes or disconnect/retry.
- Tokens/verifiers must enter **only via hidden stdin or a parent process's
  anonymous pipe**. Never put them in arguments, environment, files, shell
  expansions, command history, logs or recorded terminal output. Disable parent
  HTTP/SQL debug logging. Do not use `.env` or credential-store discovery.
- Findings use allowlisted booleans/statuses/times; errors never dump bodies,
  headers, exception messages/stacks, consent URLs or personal calendar IDs.
  JS/Python immutable strings cannot promise forensic memory zeroization; these
  tools clear reachable token containers and never intentionally persist tokens.
- Run the CLI in a dedicated process. Catchable interruption restores the prior
  TTY mode, pauses stdin and removes listeners. SIGKILL, power loss and abrupt
  host termination cannot guarantee cleanup (`stty sane` if needed). Nothing in
  cleanup revokes a grant or deletes an event.

## 1. Exact-SDK automatic revocation observer

Requirements: **Node 24.15.0** (the tested version), local `sdk/src` unchanged,
current staging API origin verified by root, accurate local/server UTC clocks.
No installation or compilation output is needed. `sdk-source.mjs` uses Node's
built-in TS transform and resolves SDK `.js` imports to their actual `.ts`
sources; this is the real `LensLayerClient.tools()`, not a REST imitation. Node
prints an expected experimental-transform warning. The final finding includes
SHA-256 identities of the SDK source files actually loaded.

1. Record a UTC `fresh-after` immediately before the **owner** creates a new
   short-lived staging credential in the existing UI. No helper creates it.
   Use the form-compatible scope: exactly `context.retrieve` plus
   `workspace.context_tasks.create`, exactly one existing disposable context and
   one existing assignee, `max_actions_per_run=1`, human approval **required**,
   no contracts/Calendar targets. Do not create a run. Although the form includes
   a write-capable tool, the observer cannot invoke it; its transport allowlist
   permits only `GET /api/v1/agent/tools`.
2. Root's existing authorized read-only DB tool inspects the exact new principal
   and org using `scope-readback.sql`. Bind IDs, never the bearer. It verifies
   current delegator owner/admin membership and zero runs. The query selects a
   one-way verifier for **this fresh principal only**, never an old credential.
   SQL names match current source; the template has not been run against staging.
   `:name` placeholders are adapter placeholders, not raw psql syntax.
3. Within 60 seconds, construct a **single-line** JSON envelope in memory:
   `{ "token": <fresh bearer>, "observed_at": <query time>,
      "principal": <query principal> }`.
   `token_sha256` binds the full bearer to the readback, not merely its public
   prefix. Never save this envelope or verifier as an evidence file. The helper
   checks org/context/assignee, exact tool set, membership, empty fixture,
   creation after the fresh-after fence (at most 15 minutes old), active state,
   expiry 30 seconds–1 hour ahead and the SHA-256 binding before its first HTTP.
   The readback is **owner-supplied evidence**, not a SQL query performed by the
   SDK or a cryptographically signed external attestation.
4. Start from the workspace root, replacing only **nonsecret** placeholders:

   ```sh
   node operator/staging-acceptance/sdk-revocation.mjs \
     --base-url https://STAGING-API-ORIGIN \
     --org ORG-UUID --context CONTEXT-UUID --assignee ASSIGNEE-UUID \
     --fresh-after 2026-10-15T12:00:00Z \
     --wait-seconds 180 --ack authorized-staging-read-only
   ```

   Paste the envelope at the hidden prompt; alternatively the authorized parent
   process writes JSON directly to `Popen(..., stdin=PIPE)` and immediately closes
   stdin. **Stream stdout while the child is running**; do not buffer it until
   completion. There is no hidden `REVOKED` prompt to miss.
5. After `phase:baseline_positive` appears, root has the owner revoke **only the
   emitted new agent ID** in the existing owner UI. The observer polls the same
   exact SDK GET every second, for at most the chosen 1–600-second bound (default
   180), stopping before the expiry safety margin. Each request is limited to
   five seconds and 64 KiB, redirects are not followed, SDK retries are **zero**.
   No worker/action/effect is needed. A revoked credential must not be reused in
   a later run; this one in-process observation is the purpose of the fixture.
6. Preserve the redacted baseline/final output and a **separate** dated owner
   read-only principal readback proving `revoked_at`, unchanged `expires_at`,
   org/agent identity, zero runs, and retained delegator membership. A 401/403
   alone does not distinguish deliberate revocation from authority loss or
   unrelated rejection. Root must correlate these records; the helper explicitly
   emits `owner_revocation_metadata_still_required:true`.

Success is a positive exact-scope HTTP 200 baseline followed by actual SDK
401/403, completed over five seconds before expiry according to both local UTC
and the HTTP Date header (maximum accepted skew five seconds). Missing Date,
transport failure, 404/429/5xx, expiry, no denial or interruption is incomplete,
not revocation proof. A final in-flight request may take up to five additional
seconds, still subject to the pre-expiry check. No automatically retried HTTP.

## 2. Renewed product-grant GET and natural refresh

**Do not run `backend.app.calendar_sandbox`.** Its consent/create/forced-expiry/
disconnect/reconnect/final-disconnect lifecycle is inappropriate for the already
completed staging event and the existing active renewed connection.

Pinned fixture:

- Old connection `a3208ad4-3427-4acf-9946-4ac4298b6bcb`: revoked, revision 2,
  empty encrypted payload, no pending revoke (root's existing evidence).
- Renewed connection `75a57c6d-2b10-4b25-9a4c-a96658ff4abe`: active, revision 0
  at the supplied readback; later natural refresh may legitimately advance it.
- Existing event `llaff707c0c9064758bda6e85905917737`, original action
  `96e786d7-74f1-4f4c-82be-c4f9b5e95377`, run
  `ee06a0a5-208d-422f-a147-c1417471cca5`, original input hash
  `850e803ffdde52e0a48ac9d40481cc8c5faedb34f742771b956c466cf599d176`.
- Calendar identity is SHA-256 pinned in source; its personal ID is never output.

`calendar_renewal.py` is a concrete callable for root's **existing authorized
staging process**, not a credential-discovering CLI. It accepts already-built
`database`/`settings`, org and disposable calendar ID. Root may use its already
authorized pinned staging secrets through gcloud **in process memory**; this
agent did not read/use those secrets. The module never calls gcloud, loads `.env`,
creates settings from ambient environment, or prints any secret. Run in a
dedicated single-thread process; legacy dotenv loading is suppressed during
backend imports. Settings must already specify staging and HTTP timeout 1–10 s.

Concrete integration inside that existing authorized process:

```python
import importlib.util
import json
spec = importlib.util.spec_from_file_location(
    "calendar_renewal", "operator/staging-acceptance/calendar_renewal.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
try:
    finding = module.qualify_existing(
        database, settings, organization_id, disposable_calendar_id,
        ack="existing-staging-grant-get-only-runtime-cas", wait_seconds=0)
    print(json.dumps(finding))
except module.Incomplete:
    print(json.dumps({"complete": False, "reason": "calendar_incomplete_no_retry"}))
```

The default performs one GET of the old stable event through the new grant,
checks exact persisted original intent using the existing product verifier, and
rechecks credential revision/payload and fixture state afterward. No action,
approval, receipt, connection state or provider event is written. The original
event provenance must still refer to the **old** connection; never rewrite it to
the renewed connection. Encrypted grants are loaded/decrypted only in that root
process; token containers are never returned or printed.

**Natural refresh is the one explicit exception to otherwise read-only work.**
If naturally due (runtime's 30-second safety window), the callable invokes the
existing `calendar_runtime._usable_tokens`, which POSTs the existing refresh
grant and commits its encrypted replacement with revision CAS and active/not-
revoked checks. This preserves a rotated refresh token. It never edits expiry,
uses `force_refresh`, directly exchanges a refresh token, creates a new grant,
or drops a successful rotation instead of persisting it. Root must separately
authorize this existing runtime-CAS persistence; a strictly read-only DB role
cannot qualify refresh. No other writes are authorized.

If the access token is not due, successful GET qualifies **renewed-grant access
only**, and `natural_refresh_persisted_by_runtime_cas:false` is truthful. Root
can schedule the single check near natural expiry; optional `wait_seconds` is
bounded to 0–300 and never forces expiry. It does not wait indefinitely. Provider
calls retain the product's existing size/time limits (configured timeout 1–10 s,
response streaming budget up to 4× timeout plus an in-flight read). No 401 retry,
CAS-loss retry, automatic revocation, duplicate insert or action reconciliation.
CAS loss can leave an externally rotated token uncertain: stop and inspect,
never blindly exchange again. Offline tests mock this adapter boundary; they do
not establish real DB concurrency or Google refresh behavior.

## 3. Independent Google API inspection (separate qualification)

Only use an **already-authorized existing** read-only inspector token from a
different OAuth **project**, for the same owner. No new inspector grant/project
is authorized by this task. If none exists, this gate remains blocked; the CLI
does not obtain one. The two required inspector scopes are
`calendar.calendarlist.readonly` and `calendar.events.readonly`. Do not widen the
product's sole `calendar.events.owned` scope.

Run `node operator/staging-acceptance/calendar-inspector.mjs` with no arguments.
Hidden single-line JSON/anonymous pipe input:

```text
{"ack":"existing-independent-read-only-grant","token":<existing inspector access token>,"calendar_id":<same disposable ID>,"expected":<original durable dispatch_intent JSON>}
```

This is a schema illustration, **not** a shell command. Parent must copy expected
fields from the original approved action's read-only durable dispatch intent, not
the response being tested. The helper pins calendar/event/action/run/input hash,
original connection, title and UTC times; description and provenance comparison
use that trusted immutable snapshot. Three fixed Google-origin GETs inspect:
CalendarList owner/nonprimary/nondeleted, exact event fields/private provenance/
reminders/no attendees/recurrence/conference/attachments, and exactly one event
with no further page. Five-second request deadlines, 64-KiB bodies, no redirects,
no pagination/retries/refresh/token introspection or writes. Redacted findings only.

### What each result establishes

| Evidence | Can establish | Cannot establish |
| --- | --- | --- |
| Product integration metadata / old receipt | Stored new consent, old completed action, prior natural refresh/revocation | New-grant API usability or new refresh; Google account/ownership |
| New product-grant GET callable | Current new-grant access to the original exact event; natural runtime-CAS refresh **only if observed** | Independent event count, CalendarList ownership, equal Google subjects, browser/session/log acceptance |
| Independent inspector's three GETs | API-owned secondary calendar, exact event fields and exactly one event | Use of the product's renewed grant; OAuth project/scope provenance; same-subject equality |
| Existing browser observations | One visible unchanged event before/after reconnect | Inspector API fields/ownership or renewed product API use |

Inspector project/client/scope provenance needs separate owner evidence. The
opaque token is not introspected, and owner CalendarList plus product owned-event
scope does **not** prove both OAuth grants' account subjects match. Exhaustive
callback one-use/session binding, query/log redaction and live browser behavior
remain separate gates, not facts inferred from these tools.

## Offline verification

From the exact workspace root:

```sh
node --test operator/staging-acceptance/acceptance.test.mjs
python3 -B -m unittest discover -s operator/staging-acceptance -p 'test_*.py' -v
```

No install, network, live DB, credential-store access or backend import is needed
for tests. They exercise the actual SDK against injected fetches, hidden input
including real POSIX PTY cleanup, redaction, scope/clock/expiry failures,
independent inspector failures, and the renewal adapter's existing runtime-CAS
delegation/GET-only/revision-fence behavior. They are not live acceptance proof.
