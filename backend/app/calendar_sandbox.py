"""Explicit opt-in real OAuth + one event in a user-owned disposable calendar.

Never run automatically in tests. No .env loading. All platform data is local,
temporary and synthetic. The event remains for manual inspection/deletion.
"""
import argparse
import getpass
import json
import os
import tempfile
import secrets
from datetime import timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from .config import Settings
from .models import utcnow
from .calendar_sandbox_acceptance import CalendarAcceptanceInspector, callback_payload


class _SandboxSettings(Settings):
    @classmethod
    def settings_customise_sources(cls, settings_cls, init_settings, env_settings, dotenv_settings, file_secret_settings):
        # Only the explicitly supplied sandbox values; never inherit product keys,
        # S3/cloud worker configuration, dotenv or secret-directory sources.
        return (init_settings,)


def run_sandbox():
    if os.environ.get("LENSLAYER_SANDBOX_GOOGLE_ACK") != "write_one_event_to_disposable_calendar":
        raise ValueError("Explicit disposable Calendar write acknowledgment is required.")
    calendar_id = os.environ.get("LENSLAYER_SANDBOX_GOOGLE_CALENDAR_ID", "")
    if not calendar_id.endswith("@group.calendar.google.com") or any(c.isspace() for c in calendar_id):
        raise ValueError("Supply a dedicated disposable secondary calendar ID, never primary.")
    # Legacy document-analysis imports load dotenv as a side effect. This isolated
    # single-process harness must not import real .env credentials, even though it
    # uses the application's real factory/runtime. No HTTP is mocked here.
    from unittest.mock import patch
    with patch("dotenv.load_dotenv", return_value=False):
        from .agent_runtime import claim_next_agent_action, process_agent_action
        from .application import create_app
    from .calendar_connector import require_connector_config
    with tempfile.TemporaryDirectory(prefix="lenslayer-calendar-sandbox-") as directory:
        settings = _SandboxSettings(_env_file=None, environment="local", auth_mode="local", auto_create_schema=True,
            database_url=f"sqlite:///{Path(directory) / 'sandbox.db'}", object_storage_root=Path(directory) / "objects",
            google_calendar_client_id=os.environ.get("LENSLAYER_SANDBOX_GOOGLE_CLIENT_ID", ""),
            google_calendar_client_secret=os.environ.get("LENSLAYER_SANDBOX_GOOGLE_CLIENT_SECRET", ""),
            google_calendar_redirect_uri=os.environ.get("LENSLAYER_SANDBOX_GOOGLE_REDIRECT_URI", ""),
            google_calendar_enabled=True, calendar_session_binding_key=os.urandom(48).hex(),
            connector_encryption_key=Fernet.generate_key().decode(),
            connector_state_signing_key=os.urandom(48).hex(), agent_action_lease_seconds=180,
            email_backend="disabled", malware_scan_backend="signature", review_worker_job="")
        require_connector_config(settings)
        print("Use a separately consented read-only inspector grant from a DIFFERENT OAuth PROJECT, for the SAME sandbox owner.")
        inspector = CalendarAcceptanceInspector(settings, getpass.getpass("Independent read-only inspection access token (hidden): "))
        try:
            inspector.owned_secondary(calendar_id)
            inspector.exact_count(calendar_id, 0)
        except Exception:
            inspector.close()
            raise
        with TestClient(create_app(settings)) as client:
            human = {"X-LensLayer-User": "disposable-sandbox-owner", "X-LensLayer-Email": "sandbox@example.test"}
            # Explicit ephemeral test-session signer, not a production browser/BFF
            # proof. Same session across both consents; fresh one-time proof per call.
            test_session_id = secrets.token_urlsafe(32)

            def call(method, route, headers, **kwargs):
                if method == "post" and "/calendar/" in route:
                    import jwt
                    from .calendar_session import AUDIENCE, ISSUER, session_fingerprint
                    from .service_domains.agents import canonical_json, digest
                    org_id = route.split("/")[2]
                    tail = route.split("/calendar/")[1]
                    operation = tail if tail.startswith("oauth/") else "connections/disconnect"
                    body = kwargs.get("json") or {"connection_id": tail.split("/")[1]}
                    now = int(utcnow().timestamp())
                    headers = {**headers, "X-LensLayer-Calendar-Session": jwt.encode({"aud": AUDIENCE, "iss": ISSUER,
                        "sub": human["X-LensLayer-User"], "org": org_id, "op": operation,
                        "fp": session_fingerprint(settings.calendar_session_binding_key, test_session_id),
                        "body_sha256": digest(canonical_json(body)), "jti": secrets.token_hex(16),
                        "iat": now, "nbf": now, "exp": now + 60}, settings.calendar_session_binding_key, algorithm="HS256")}
                response = getattr(client, method)("/api/v1" + route, headers=headers, **kwargs)
                if response.status_code >= 400:
                    raise ValueError("Sandbox platform operation rejected: HTTP " + str(response.status_code))
                return response.json()

            org = call("post", "/organizations", human, json={"name": "Disposable Calendar Verification", "slug": "calendar-sandbox"})["id"]
            base = f"/organizations/{org}"
            connections = []

            def consent():
                start = call("post", base + "/calendar/oauth/start", human,
                             json={"display_name": "Disposable sandbox only", "calendar_id": calendar_id})
                print("Open this OAuth URL in a trusted browser; use the SAME sandbox owner. Do not record terminal output:")
                print(start["authorization_url"])
                state = parse_qs(urlparse(start["authorization_url"]).query)["state"][0]
                returned = getpass.getpass("Full returned callback URL (hidden, never logged): ")
                payload = callback_payload(returned, settings.google_calendar_redirect_uri, state)
                connection = call("post", base + "/calendar/oauth/callback", human, json=payload)
                connections.append(connection)  # revoke even if subsequent provenance checks fail
                # Actual durable OAuth provenance, not the fact that the UI said success.
                from sqlalchemy import select
                from .connector_models import CalendarCredential, CalendarOAuthState
                from .models import IntegrationConnection
                from .service_domains.agents import digest
                with client.app.state.database.session_factory() as session:
                    oauth = session.scalar(select(CalendarOAuthState).where(CalendarOAuthState.state_hash == digest(state)))
                    public = session.get(IntegrationConnection, connection["id"])
                    credential = session.get(CalendarCredential, connection["id"])
                    if (not oauth or not oauth.consumed_at or oauth.organization_id != org
                            or public.created_by_user_id != oauth.user_id or credential.organization_id != org
                            or not oauth.session_fingerprint or credential.session_fingerprint != oauth.session_fingerprint):
                        raise ValueError("Sandbox OAuth human/state provenance is incomplete.")
                return connection

            try:
                connection = consent()
                target = {"connection_id": connection["id"], "calendar_id": calendar_id}
                created = call("post", base + "/agents", human, json={"name": "Sandbox event client",
                    "allowed_tools": ["google_calendar.events.create"], "contract_ids": [], "assignee_ids": [],
                    "calendar_targets": [target], "require_approval": True, "expires_at": (utcnow() + timedelta(hours=1)).isoformat()})
                agent = {"Authorization": "Bearer " + created["token"]}
                start_at = utcnow() + timedelta(days=1)
                condition = {"type": "calendar_event_created", **target, "summary": "LensLayer disposable verification",
                             "start_at": start_at.isoformat(), "end_at": (start_at + timedelta(minutes=15)).isoformat()}
                run = call("post", "/agent/workflows", agent, json={"idempotency_key": "sandbox-run-1",
                    "goal": "Create exactly one approved disposable event", "calendar_targets": [target],
                    "allowed_tools": ["google_calendar.events.create"], "max_actions": 1,
                    "deadline_at": (utcnow() + timedelta(minutes=15)).isoformat(), "success_condition": condition})
                action = call("post", f"/agent/runs/{run['id']}/tool-actions", agent,
                    json={"idempotency_key": "sandbox-event-1", "tool": "google_calendar.events.create", "input": condition})
                print("Review exact immutable action before approving:")
                print(json.dumps({"input": action["input"], "input_sha256": action["input_sha256"]}, indent=2))
                if input("Type APPROVE DISPOSABLE EVENT to dispatch: ") != "APPROVE DISPOSABLE EVENT":
                    raise ValueError("Sandbox approval withheld; no calendar write dispatched.")
                call("post", base + f"/agent-runs/{run['id']}/actions/{action['id']}/approval", human,
                      json={"decision": "approved", "reason": "Explicit sandbox-only event verification."})
                # Force the real refresh path using only this ephemeral local grant.
                from .connector_models import CalendarCredential
                from .calendar_connector import decrypt_credentials, encrypt_credentials
                with client.app.state.database.session_factory() as session:
                    credential = session.get(CalendarCredential, connection["id"])
                    tokens = decrypt_credentials(settings, credential)
                    tokens["expires_at"] = (utcnow() - timedelta(seconds=1)).isoformat()
                    credential.encrypted_json = encrypt_credentials(settings, credential.connection_id, org, tokens)
                    refresh_revision = credential.revision
                    session.commit()
                claim = claim_next_agent_action(client.app.state.database, settings)
                if claim is None:
                    raise ValueError("No sandbox action was claimed.")
                process_agent_action(client.app.state.database, settings, client.app.state.object_store, *claim)
                result = call("get", f"/agent/runs/{run['id']}", agent)
                actions = call("get", f"/agent/runs/{run['id']}/actions", agent)
                print(json.dumps({"run_status": result["status"], "action_status": actions[0]["status"],
                                  "result": actions[0]["result"], "error_code": actions[0]["error_code"]}, indent=2))
                print("Inspect/delete the synthetic event in the disposable calendar. Do not retry with a new key on uncertainty.")
                if result["status"] != "succeeded":
                    raise ValueError("Real-provider verification did not pass; inspect the durable outcome above.")
                from .agent_models import AgentAction
                with client.app.state.database.session_factory() as session:
                    row = session.get(AgentAction, action["id"])
                    credential = session.get(CalendarCredential, connection["id"])
                    from .models import IntegrationConnection
                    owner = session.get(IntegrationConnection, connection["id"]).created_by_user_id
                    expected = json.loads(row.dispatch_intent_json)
                    if (credential.revision <= refresh_revision or row.approved_input_sha256 != row.input_sha256
                            or row.approval_status != "approved" or row.approved_by_user_id != owner or not row.dispatch_started_at
                            or expected["id"] != "ll" + row.output_id.replace("-", "")
                            or actions[0]["result"].get("event_id") != expected["id"] or len(actions) != 1):
                        raise ValueError("Refresh/stable-ID/immutable approval verification failed.")
                inspector.verify_event(calendar_id, expected)
                disconnected = call("post", base + f"/calendar/connections/{connection['id']}/disconnect", human)
                if disconnected["provider_revocation_pending"]:
                    raise ValueError("Provider revocation incomplete; manually revoke and stop before reconnecting.")
                with client.app.state.database.session_factory() as session:
                    credential = session.get(CalendarCredential, connection["id"])
                    if not credential.revoked_at or credential.encrypted_json:
                        raise ValueError("Local disconnect did not erase/revoke the sandbox grant.")
                connections.remove(connection)
                reconnected = consent()
                if reconnected["id"] == connection["id"]:
                    raise ValueError("Reconnect reused the old grant identity.")
                # New product grant independently reads the existing stable ID; no new POST.
                from .calendar_connector import GoogleCalendarHTTP
                provider = GoogleCalendarHTTP(settings)
                try:
                    with client.app.state.database.session_factory() as session:
                        credential = session.get(CalendarCredential, reconnected["id"])
                        tokens = decrypt_credentials(settings, credential)
                    actual = provider.get_event(calendar_id, expected["id"], tokens["access_token"])
                    provider.verify(actual, expected)
                finally:
                    provider.close()
                inspector.verify_event(calendar_id, expected)
            finally:
                try:
                    for connection in connections:
                        disconnected = call("post", base + f"/calendar/connections/{connection['id']}/disconnect", human)
                        print("Local grant revoked. Provider revocation pending:", disconnected["provider_revocation_pending"])
                        if disconnected["provider_revocation_pending"]:
                            print("Revoke app access manually in the sandbox Google account; temporary local credentials will be removed.")
                            raise ValueError("Final provider revocation is incomplete; live acceptance did not pass.")
                finally:
                    inspector.close()
            print(json.dumps({"calendar_live_checks_passed": True, "event_id": expected["id"],
                              "refresh_verified": True, "reconnect_read_verified": True,
                              "production_session_binding_verified": False}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true", help="Run the explicitly acknowledged sandbox flow.")
    args = parser.parse_args()
    if not args.run:
        parser.error("Use --run only after configuring explicit sandbox consent.")
    try:
        run_sandbox()
        return 0
    except Exception:
        print("Calendar sandbox incomplete. Do not repeat uncertain writes; inspect the disposable calendar and revoke grants.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
