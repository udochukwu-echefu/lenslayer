# Coordinator-operated disposable Calendar acceptance

The trusted Calendar server bridge binds backend OAuth state to the same encrypted NextAuth login session, with short-lived one-use server attestation. See the [operations runbook](deployment/agent-worker-operations.md) for deployment keys and the [roadmap acceptance record](architecture/agent-roadmap-acceptance-2026-10-14.md) for completed checks and remaining gates. The sandbox generates an explicit ephemeral test proof; it is still not production browser acceptance. Product grant identity/ownership remains unverified as described below.

## Current staging evidence — 15 October 2026

**Reconciled through the coordinator's approximately 17:15 UTC finish update.**
This document makes no new live reads or provider calls. Calendar evidence below
retains its actual 15:22:43/15:25:19 UTC observations; later SDK/copy/configuration
results do not become independent Google inspector or browser-session proof.

The coordinator's supplied `finish-current-evidence/FINISH-STATE.json` records
**15:22:43 UTC** successful GET of the **existing** event
`llaff707c0c9064758bda6e85905917737` through renewed connection
`75a57c6d-2b10-4b25-9a4c-a96658ff4abe`. Natural refresh used the existing runtime's
encrypted-token **CAS persistence**, revision **0 → 1**, not forced expiry or an
unpersisted token exchange.

Independent **15:25:19 UTC** DB readback in
`finish-current-evidence/calendar-after-renewal-readback.json` was read-only and
selected no tokens. It confirms new active/revision 1/no pending revoke; old
`a3208ad4-3427-4acf-9946-4ac4298b6bcb` revoked/revision 2/empty encrypted payload/
no pending revoke; and the original action still succeeded/approved/one attempt
with unchanged input/approved hash and output. **No event write, revocation retry
or model call occurred.** This closes renewed-grant existing-event GET and natural
refresh only. Earlier 07:38 revision-0 consent and unchanged Google UI were not
API proof; they remain historical evidence, superseded narrowly by this GET.

**Still open:** independent Google API inspector/CalendarList ownership/exact-field
audit and token project/scope provenance, account-subject equality, and exhaustive
session/log acceptance. At the earlier Google Playground scope-preparation
observation, **Authorize had not occurred**. Current independent inspector/
provenance remains **pending owner handoff**; no newer independent token/API
result is supplied or implied.
The product still does not verify provider account identity/calendar ownership.
No new live call was made by this documentation update.

Later supplied evidence narrows other gates without expanding the Calendar claim:

- **Fresh live SDK denial is now complete:** a new empty context-scoped grant
  had an actual-SDK positive baseline **17:12:33.557 UTC**, coordinator-operated
  owner-UI revocation **17:13:20.840149 UTC**, and SDK **401 at 17:13:21.750 UTC**
  (server Date **17:13:21 UTC**) before **17:50 UTC** expiry. Independent
  **17:14:03 UTC** read-only metadata confirms revision 1, same scope/expiry/owner
  membership and zero runs, without selecting bearer/verifier. This closes the
  SDK missed-expiry gap, **not Google inspector/provenance or native-host
  post-reconnect invocation**. The earlier unused helper attempt failed before
  baseline on Neon connection handling and was revoked unused; the graph was not
  retried. Exact fresh-agent/proof bindings are in the roadmap record.
- **Copy repair and deployed bytes:** commit
  `08c1a149636ce7a4d4d0a256aa288be6ad716faa`, component SHA-256
  `e060e09ad32329b8d701f7a45f97bf0738f8cbe270514ecc93e2dfed43d3ef54`, passed
  23 targeted React tests/lint, 14 independent handler checks and real Chrome
  **synthetic** normal/forced-Clipboard-API-denial paste checks. The isolated
  locked Next16.3.8/OpenNext1.20.11 build passed; staging Worker
  `40f15708-9306-4f3c-a369-61494e71d00b` deployed **17:09:14 UTC**. Public agents
  JS SHA-256 `f6700794c1b3672fa8ad368e08ba8b7f627ca28337fa0393b3fbbec93d956ef5`
  matches the artifact. The user's subsequent copy-failure report came from a tab
  still loading `8073-8c4310d849321046.js` after a pre-deploy-completion refresh.
  Root reloaded at approximately **17:15 UTC** and verified new
  `8073-2eeeeb87f0b60399.js` and `agents/page344ec6…` assets. No additional
  credential was created for that reload, and personal user confirmation of new
  copy success is still pending. This does not prove Calendar callback/session
  behavior or actual-credential clipboard behavior.
- **Cloudflare configuration read, not exhaustive log acceptance:** after existing
  SSO, Root observed Worker Settings logs **ON**, persistence **ON**, invocation
  logs **unchecked**, traces **OFF**, Issues **OFF**, and no export destinations;
  tabs were closed. This is not a full legacy Logpush/Tail inventory, callback/
  session/log redaction check, or proof that all logging is disabled.

The composed backend is locally code-complete in the separate 39-path
`CODE-COMPLETE.md`/`.code-complete-local/FINAL-MANIFEST.json` freeze (manifest
SHA-256 `c7354eb92c163cc5f0528f233cb03a04315db9bd347ab1c038009ae43e00ee33`):
**66 offline + 21 local PG17.11 tests, zero skips**, with original6b1/DAG and all
three P2 repairs composed. Root integration/final independent review and new-
source canonical PG18.6 CI are still pending; none of the older Calendar proofs
automatically qualifies that newer source. CI configuration now targets PG18.6,
Node24.15 and 91 offline operator identities, not a claimed new CI success.
The separately reviewed/fixed loader and Neon wrappers have 21 wrapper tests/
18 independent DB probes; the uncommitted SDK seven-file delta has 23 actual
space-path passes. None creates an independent Google API acceptance result.

Production API `lenslayer-api-00007-2jm`/schema6b1 remains unchanged; queues/
recovery stay paused, model disabled/key unbound and worker min0. The **16:37:29
UTC** PG18.6 provider recovery-copy check matched all 33 table values via salted
server aggregates, columns/defaults, 223 indexes and 470 constraints. That is
snapshot-content proof, not an independent archive, RPO/RTO or candidate migration.
No new event write/revoke, paid call, deployment/activation or SDK signing/
publication is authorized here. Budget reservations remain **US$3.4873356 of
US$5**; no further paid call is needed.

Do **not** rerun the create/disconnect/reconnect sandbox below for this existing
staging fixture. The integrated operator handoff uses hidden raw-token input and
read-only inspection of the original event; no new grant/event or revoke retry is
authorized. Independent inspection must use an existing separately authorized
grant from a different OAuth project (a Playground-owned client is acceptable
with owner-witnessed provenance). For the owned disposable calendar,
`calendar.calendarlist.readonly` plus `calendar.events.owned.readonly` suffice;
`calendar.events.readonly` is also supported. Opaque-token provenance and equal
Google subjects cannot be inferred from a successful GET. Keep product scope
`calendar.events.owned` unchanged.

## Standalone fresh-fixture harness — separate authorization required

Never run automatically against Google. Fake HTTP is useful regression testing, **not live acceptance proof**. The harness uses temporary local SQLite/object storage, synthetic data and a generated encryption/state key. It leaves the one synthetic event for manual inspection/deletion and does not compensate provider effects.

The standalone harness suppresses the legacy application's import-time dotenv loader. Its initializer-only Settings subclass ignores ambient product/cloud configuration and secret-directory sources; only explicitly named sandbox inputs are supplied. Product settings/config source is unchanged.

## Prerequisites and safe command

1. Coordinator creates an **empty, owned SECONDARY disposable calendar** and has explicit authority to write one synthetic private event. Never use `primary` or an existing/shared calendar. Live consent/write belongs to the coordinator.
2. Configure a dedicated product OAuth test client with the exact redirect. Product scope remains only `calendar.events.owned`.
3. For this separately authorized fresh-fixture flow, consent a read-only inspection OAuth client in a **DIFFERENT OAuth PROJECT** for the SAME owner, with `calendar.calendarlist.readonly` and `calendar.events.readonly` (or `calendar.events.owned.readonly` for the owned disposable calendar). A different client in the product project is insufficient: [Google revocation invalidates grants for all clients in that project](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke). Supply its short-lived access token at the hidden prompt. No inspector refresh or writes are performed. This extra read scope is harness-only; do not broaden product grants to make tests pass. Manual inspector cleanup belongs to that separate authorization, not the existing staging grant's remaining GET-only checks.
4. Inject only these sandbox environment values from an approved server-side source, not `.env`: `LENSLAYER_SANDBOX_GOOGLE_CLIENT_ID`, `LENSLAYER_SANDBOX_GOOGLE_CLIENT_SECRET`, `LENSLAYER_SANDBOX_GOOGLE_REDIRECT_URI`, `LENSLAYER_SANDBOX_GOOGLE_CALENDAR_ID`, and `LENSLAYER_SANDBOX_GOOGLE_ACK=write_one_event_to_disposable_calendar`. Use a clean process environment without unrelated product settings/credentials. Do not capture terminal output containing consent URLs.

```sh
.venv/bin/python -m backend.app.calendar_sandbox --run
```

The command itself does not read a secret file or create calendars. On each of two consent flows, paste the **actual returned full callback URL** into the hidden prompt; it is never logged. The harness verifies exact redirect, nonduplicate code/state, and constant-time state matching before relaying the actual returned state/code into the authenticated API. It checks consumed durable OAuth state, organization and human creator provenance.

## Checks and stop conditions

- Inspector CalendarList GET must show exact ID, `accessRole:owner`, nonprimary/nondeleted calendar. Events list must be empty before write.
- Human reviews exact input/hash and types `APPROVE DISPOSABLE EVENT`. No approval means no dispatch.
- One fixed action and one stable event ID; forced local access expiry exercises the real refresh HTTP path before dispatch. The persisted credential revision must advance.
- Existing independent workflow GET verification plus an additional inspector GET of the exact event: private, confirmed, exact dates/title/description/provenance/reminders, no attendees/recurrence/conference/attachments. Inspector list must contain **exactly one** event and no further page.
- Disconnect must erase/revoke the local grant and report completed provider revocation. Reconnect requires new human consent and a new grant identity. The new product grant only GETs the existing stable ID; the inspector verifies it again. Final product grant is disconnected too.
- Any uncertainty stops: no repeated POST, no new event ID, no automatic cleanup or second write. Inspect the provider calendar manually. Disconnect failure, inspector token expiry, missing scope or incomplete revocation means acceptance is incomplete. Process death cannot guarantee provider revocation—manually revoke both OAuth apps and inspect the event.

## What this does NOT prove

The local harness uses a single local authenticated human identity/TestClient session plus an explicit ephemeral session signer, **not production OIDC or a real browser session**. Product state binds organization/user/client/redirect and the server bridge's login-session fingerprint, and is one-time. Actual NextAuth/browser QA remains a release gate. No Google account subject is recorded/verified by the product connector; the operator must ensure both grants use the same account. The opaque inspector token is not introspected: its separate project, client and read-only scopes require independent owner evidence, not merely a successful GET or a pass message. Inspector ownership plus product owned-event scope are not a proof of account identity equality. Required keys are in the [operations runbook](deployment/agent-worker-operations.md).

Temporary DB removal does not delete the provider event, revoke the independent inspector token or establish provider compensation. The harness's metadata explicitly reports `production_session_binding_verified:false`, even if its real Calendar checks pass. No live check has been performed by the implementation agent.
