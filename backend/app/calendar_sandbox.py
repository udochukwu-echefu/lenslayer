"""Explicit opt-in real OAuth + one event in a user-owned disposable calendar.

Never run automatically in tests. No .env loading. All platform data is local,
temporary and synthetic. The event remains for manual inspection/deletion.
"""
import argparse
import getpass
import json
import os
import tempfile
from datetime import timedelta
from pathlib import Path

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from .agent_runtime import claim_next_agent_action, process_agent_action
from .config import Settings
from .application import create_app
from .models import utcnow


def run_sandbox():
    if os.environ.get("LENSLAYER_SANDBOX_GOOGLE_ACK") != "write_one_event_to_disposable_calendar":
        raise ValueError("Explicit disposable Calendar write acknowledgment is required.")
    calendar_id = os.environ.get("LENSLAYER_SANDBOX_GOOGLE_CALENDAR_ID", "")
    if not calendar_id.endswith("@group.calendar.google.com") or any(c.isspace() for c in calendar_id):
        raise ValueError("Supply a dedicated disposable secondary calendar ID, never primary.")
    from .calendar_connector import require_connector_config
    with tempfile.TemporaryDirectory(prefix="lenslayer-calendar-sandbox-") as directory:
        settings = Settings(_env_file=None, environment="local", auth_mode="local", auto_create_schema=True,
            database_url=f"sqlite:///{Path(directory) / 'sandbox.db'}", object_storage_root=Path(directory) / "objects",
            google_calendar_client_id=os.environ.get("LENSLAYER_SANDBOX_GOOGLE_CLIENT_ID", ""),
            google_calendar_client_secret=os.environ.get("LENSLAYER_SANDBOX_GOOGLE_CLIENT_SECRET", ""),
            google_calendar_redirect_uri=os.environ.get("LENSLAYER_SANDBOX_GOOGLE_REDIRECT_URI", ""),
            connector_encryption_key=Fernet.generate_key().decode(),
            connector_state_signing_key=os.urandom(48).hex(), agent_action_lease_seconds=180,
            email_backend="disabled", malware_scan_backend="signature", review_worker_job="")
        require_connector_config(settings)
        with TestClient(create_app(settings)) as client:
            human = {"X-LensLayer-User": "disposable-sandbox-owner", "X-LensLayer-Email": "sandbox@example.test"}

            def call(method, route, headers, **kwargs):
                response = getattr(client, method)("/api/v1" + route, headers=headers, **kwargs)
                if response.status_code >= 400:
                    raise ValueError("Sandbox platform operation rejected: HTTP " + str(response.status_code))
                return response.json()

            org = call("post", "/organizations", human, json={"name": "Disposable Calendar Verification", "slug": "calendar-sandbox"})["id"]
            base = f"/organizations/{org}"
            start = call("post", base + "/calendar/oauth/start", human,
                         json={"display_name": "Disposable sandbox only", "calendar_id": calendar_id})
            print("Open this OAuth URL in a trusted browser; use only a sandbox Google account:")
            print(start["authorization_url"])
            print("After consent, relay the code from the configured redirect; do not paste the full URL into logs.")
            from urllib.parse import parse_qs, urlparse
            state = parse_qs(urlparse(start["authorization_url"]).query)["state"][0]
            code = getpass.getpass("One-time sandbox authorization code (hidden): ")
            connection = call("post", base + "/calendar/oauth/callback", human, json={"state": state, "code": code})
            target = {"connection_id": connection["id"], "calendar_id": calendar_id}
            try:
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
            finally:
                disconnected = call("post", base + f"/calendar/connections/{connection['id']}/disconnect", human)
                print("Local grant revoked. Provider revocation pending:", disconnected["provider_revocation_pending"])
                if disconnected["provider_revocation_pending"]:
                    print("Revoke app access manually in the sandbox Google account; temporary local credentials will be removed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true", help="Run the explicitly acknowledged sandbox flow.")
    args = parser.parse_args()
    if not args.run:
        parser.error("Use --run only after configuring explicit sandbox consent.")
    try:
        run_sandbox()
        return 0
    except ValueError as exc:
        print(str(exc))  # only our fixed/public messages, never HTTP exception bodies
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
