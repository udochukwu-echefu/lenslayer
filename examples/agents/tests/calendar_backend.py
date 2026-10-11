"""Loopback API/worker fixture: real ledger with file-persisted fake Google HTTP.

Explicit test root only. No environment files, real OAuth, model calls or cloud
writes. File-persisted provider objects survive independent worker processes.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from unittest.mock import patch

import httpx
from cryptography.fernet import Fernet

from backend.app.application import create_app
from backend.app.calendar_connector import GoogleCalendarHTTP
from backend.app.config import Settings
from backend.app.document_intelligence import build_review_workflow
from backend.app.worker import run_worker
from tests.test_calendar_workflows import FakeGoogle


_patches = []


def test_settings():
    root = Path(os.environ["LENSLAYER_AGENT_TEST_ROOT"]).resolve()
    if not root.is_dir() or not (root / "calendar-fixture-ack").is_file():
        raise ValueError("Explicit disposable Calendar fixture root is required.")
    key_path = root / "synthetic-encryption-key"
    if not key_path.exists():
        descriptor = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(Fernet.generate_key())
    return Settings(_env_file=None, environment="test", auth_mode="local", auto_create_schema=True,
        database_url=f"sqlite:///{root / 'calendar-agent-check.db'}", object_storage_root=root / "objects",
        email_backend="disabled", malware_scan_backend="signature", review_worker_job="",
        google_calendar_client_id="synthetic-calendar-client", google_calendar_client_secret="synthetic-client-secret",
        google_calendar_redirect_uri="http://127.0.0.1:3000/calendar/oauth-return",
        connector_encryption_key=key_path.read_text(), connector_state_signing_key="synthetic-state-signing-key-for-local-tests-only",
        hosted_agent_wait_seconds=5)


def fixture_workflow():
    return build_review_workflow(contract_analyzer=lambda _text, _context: {})


class PersistentFakeGoogle(FakeGoogle):
    def __init__(self, root):
        super().__init__()
        self.root = root
        self.state = root / "synthetic-google-events.json"
        if self.state.exists():
            self.events = {(entry["collection"], entry["event_id"]): entry["body"] for entry in json.loads(self.state.read_text())}

    def handle(self, request):
        self.unreadable_after_write = (self.root / "simulate-unreadable-readback").exists()
        try:
            return super().handle(request)
        finally:
            # Persist the independent provider effect before the DB receipt.
            if request.method == "POST" and request.url.path not in {"/token", "/revoke"}:
                pending = self.state.with_suffix(".tmp")
                pending.write_text(json.dumps([{"collection": collection, "event_id": event_id, "body": body} for (collection, event_id), body in self.events.items()]))
                pending.replace(self.state)
                with (self.root / "synthetic-google-inserts.jsonl").open("a") as handle:
                    handle.write(json.dumps({"event_id": json.loads(request.content)["id"]}) + "\n")


def install_fake_provider():
    root = Path(os.environ["LENSLAYER_AGENT_TEST_ROOT"]).resolve()
    fake = PersistentFakeGoogle(root)
    factory = lambda settings: GoogleCalendarHTTP(settings, transport=httpx.MockTransport(fake.handle))
    for target in ("backend.app.service_domains.calendar.GoogleCalendarHTTP", "backend.app.calendar_runtime.GoogleCalendarHTTP"):
        replacement = patch(target, factory)
        replacement.start()
        _patches.append(replacement)


def create_test_app():
    settings = test_settings()
    install_fake_provider()
    app = create_app(settings, review_workflow_factory=fixture_workflow)
    nonce = os.environ.get("LENSLAYER_AGENT_TEST_NONCE")
    if nonce:
        @app.get("/__lenslayer_disposable_fixture", include_in_schema=False)
        def fixture_identity():
            return {"fixture": "calendar-workflows", "nonce": nonce}
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--worker", action="store_true", required=True)
    parser.add_argument("--agents-only", action="store_true")
    args = parser.parse_args()
    settings = test_settings()
    install_fake_provider()
    try:
        run_worker(settings, once=True, agents_only=args.agents_only, review_workflow_factory=fixture_workflow)
    finally:
        for replacement in reversed(_patches):
            replacement.stop()
