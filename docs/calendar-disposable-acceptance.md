# Coordinator-operated disposable Calendar acceptance

The trusted Calendar server bridge binds backend OAuth state to the same encrypted NextAuth login session, with short-lived one-use server attestation. See the [operations runbook](deployment/agent-worker-operations.md) for deployment keys and the [roadmap acceptance record](architecture/agent-roadmap-acceptance-2026-10-14.md) for completed checks and remaining gates. The sandbox generates an explicit ephemeral test proof; it is still not production browser acceptance. Product grant identity/ownership remains unverified as described below.

Never run automatically against Google. Fake HTTP is useful regression testing, **not live acceptance proof**. The harness uses temporary local SQLite/object storage, synthetic data and a generated encryption/state key. It leaves the one synthetic event for manual inspection/deletion and does not compensate provider effects.

The standalone harness suppresses the legacy application's import-time dotenv loader. Its initializer-only Settings subclass ignores ambient product/cloud configuration and secret-directory sources; only explicitly named sandbox inputs are supplied. Product settings/config source is unchanged.

## Prerequisites and safe command

1. Coordinator creates an **empty, owned SECONDARY disposable calendar** and has explicit authority to write one synthetic private event. Never use `primary` or an existing/shared calendar. Live consent/write belongs to the coordinator.
2. Configure a dedicated product OAuth test client with the exact redirect. Product scope remains only `calendar.events.owned`.
3. Separately consent a **different read-only inspection OAuth client** for the SAME owner, with `calendar.calendarlist.readonly` and `calendar.events.readonly`. Supply its short-lived access token at the hidden prompt. No inspector refresh or writes are performed. This extra read scope is harness-only; do not broaden product grants to make tests pass. Revoke inspector access manually after testing.
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

The local harness uses a single local authenticated human identity/TestClient session plus an explicit ephemeral session signer, **not production OIDC or a real browser session**. Product state binds organization/user/client/redirect and the server bridge's login-session fingerprint, and is one-time. Actual NextAuth/browser QA remains a release gate. No Google account subject is recorded/verified by the product connector; the operator must ensure both grants use the same account. Inspector ownership plus product owned-event scope are not a proof of account identity equality. Required keys are in the [operations runbook](deployment/agent-worker-operations.md).

Temporary DB removal does not delete the provider event, revoke the independent inspector token or establish provider compensation. The harness's metadata explicitly reports `production_session_binding_verified:false`, even if its real Calendar checks pass. No live check has been performed by the implementation agent.
