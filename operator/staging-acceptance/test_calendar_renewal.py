"""Dependency-free offline adapter tests; not real DB/Google qualification."""
import copy
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace as NS
import unittest
import os
import pty
import select
import signal
import subprocess
import termios
import time

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("calendar_renewal", HERE / "calendar_renewal.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
CALENDAR = json.loads((HERE / "fixtures/disposable-calendar.json").read_text())["calendar_id"]
ORG = "synthetic-org"


class Driver:
    def __init__(self, *, due=False, fail=False, race=False):
        self.credential = NS(revision=0, encrypted_json="synthetic-encrypted")
        self.due, self.fail, self.race = due, fail, race
        self.calls, self.closed = [], False
        self.tokens = {"access_token": "synthetic-access", "refresh_token": "synthetic-rotated-refresh"}

    def load(self):
        self.calls.append("load")
        snapshot = copy.copy(self.credential)
        if self.race and self.calls.count("load") > 1:
            snapshot.revision += 1
        return snapshot, {"id": m.EVENT}

    def expiry(self, credential):
        return 1000 if self.due else 2000

    def usable(self, credential):
        self.calls.append("runtime_usable_tokens")
        if self.due:
            credential.revision += 1
            credential.encrypted_json = "persisted-rotated-payload"
            self.credential = copy.copy(credential)
        return self.tokens

    def get_verify(self, token, expected):
        self.calls.append("get_verify")
        assert token == "synthetic-access" and expected["id"] == m.EVENT
        if self.fail:
            raise ValueError("PRIVATE provider body synthetic-access")

    def close(self):
        self.closed = True


def qualify(driver, **kwargs):
    return m.qualify_existing(None, None, ORG, CALENDAR,
        ack="existing-staging-grant-get-only-runtime-cas", _driver=driver,
        _clock=lambda: 1000, **kwargs)


class QualificationTests(unittest.TestCase):
    def test_renewed_get_without_refresh_is_not_refresh_proof(self):
        driver = Driver()
        result = qualify(driver)
        self.assertTrue(result["renewed_grant_event_get_verified"])
        self.assertFalse(result["natural_refresh_persisted_by_runtime_cas"])
        self.assertFalse(result["independent_api_inspector_qualified"])
        self.assertFalse(result["calendar_ownership_verified"])
        self.assertTrue(driver.closed)
        self.assertEqual(driver.tokens, {})
        self.assertEqual(driver.calls, ["load", "runtime_usable_tokens", "get_verify", "load"])

    def test_natural_refresh_revision_and_rotated_payload_retained(self):
        driver = Driver(due=True)
        result = qualify(driver)
        self.assertTrue(result["natural_refresh_persisted_by_runtime_cas"])
        self.assertEqual(result["credential_revision_after"], 1)
        self.assertEqual(driver.credential.encrypted_json, "persisted-rotated-payload")
        self.assertNotIn("synthetic-", json.dumps(result))

    def test_bounded_wait_does_not_force_expiry(self):
        sleeps = []
        result = qualify(Driver(), wait_seconds=5, _sleep=sleeps.append)
        self.assertEqual(sleeps, [5])
        self.assertFalse(result["natural_refresh_persisted_by_runtime_cas"])

    def test_invalid_wait_or_ack_cannot_load_driver(self):
        for wait in [-1, 301, True, 1.5]:
            with self.assertRaises(m.Incomplete):
                qualify(Driver(), wait_seconds=wait)

    def test_get_rejection_never_retries_refresh_or_revokes(self):
        driver = Driver(fail=True)
        with self.assertRaises(m.Incomplete) as error:
            qualify(driver)
        self.assertNotIn("PRIVATE", str(error.exception))
        self.assertNotIn("synthetic-access", str(error.exception))
        self.assertEqual(driver.calls, ["load", "runtime_usable_tokens", "get_verify"])
        self.assertEqual(driver.tokens, {})
        self.assertTrue(driver.closed)

    def test_concurrent_revision_change_stops_after_get(self):
        driver = Driver(race=True)
        with self.assertRaises(m.Incomplete):
            qualify(driver)
        self.assertTrue(driver.closed)

    def test_wrong_calendar_rejected_before_driver_load(self):
        driver = Driver()
        with self.assertRaises(m.Incomplete):
            m.qualify_existing(None, None, ORG, "primary", ack="existing-staging-grant-get-only-runtime-cas", _driver=driver)
        self.assertEqual(driver.calls, [])


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.runtime = NS(IntegrationConnection=object(), CalendarCredential=object(), AgentAction=object(), AgentRun=object())
        self.runtime.digest = lambda value: m.INPUT_HASH if value == "synthetic-immutable-input" else "mismatched"
        self.expected = {"id": m.EVENT, "visibility": "private", "status": "confirmed", "reminders": {"useDefault": False}, "extendedProperties": {"private": {
            "lenslayer_organization": ORG, "lenslayer_connection": m.OLD,
            "lenslayer_calendar": m.CALENDAR_HASH, "lenslayer_run": m.RUN,
            "lenslayer_action": m.ACTION, "lenslayer_input": m.INPUT_HASH}}}
        self.old = NS(organization_id=ORG, provider="google_calendar", status="revoked")
        self.new = NS(organization_id=ORG, provider="google_calendar", status="active", settings_json=json.dumps({"calendar_ids": [CALENDAR]}))
        self.old_cred = NS(organization_id=ORG, calendar_ids_json=json.dumps([CALENDAR]), scopes_json=json.dumps([m.SCOPE]), revision=2, revoked_at="dated", encrypted_json="", revoke_pending=False)
        self.new_cred = NS(organization_id=ORG, calendar_ids_json=json.dumps([CALENDAR]), scopes_json=json.dumps([m.SCOPE]), revision=0, revoked_at=None, encrypted_json="synthetic-encrypted", revoke_pending=False)
        self.action = NS(status="succeeded", attempts=1, approval_status="approved", input_json="synthetic-immutable-input", input_sha256=m.INPUT_HASH, approved_input_sha256=m.INPUT_HASH, run_id=m.RUN, output_id="aff707c0-c906-4758-bda6-e85905917737", dispatch_intent_json=json.dumps(self.expected))
        self.rows = {(self.runtime.IntegrationConnection, m.OLD): self.old,
                     (self.runtime.IntegrationConnection, m.NEW): self.new,
                     (self.runtime.CalendarCredential, m.OLD): self.old_cred,
                     (self.runtime.CalendarCredential, m.NEW): self.new_cred,
                     (self.runtime.AgentAction, m.ACTION): self.action,
                     (self.runtime.AgentRun, m.RUN): NS(organization_id=ORG)}
        outer = self
        class Session:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def get(self, kind, key): return outer.rows.get((kind, key))
            def expunge(self, value): outer.detached = value
        self.backend = m.Backend.__new__(m.Backend)
        self.backend.runtime = self.runtime
        self.backend.database = NS(session_factory=Session)
        self.backend.settings = object()
        self.backend.provider = object()
        self.backend.org, self.backend.calendar = ORG, CALENDAR

    def test_exact_existing_rows_and_original_provenance_read_only(self):
        credential, expected = self.backend.load()
        self.assertIs(credential, self.detached)
        self.assertEqual(expected, self.expected)

    def test_bad_existing_rows_rejected_no_revoke_or_write(self):
        mutations = [
            (self.old_cred, "encrypted_json", "not-empty"),
            (self.old_cred, "revision", 1),
            (self.old_cred, "revoke_pending", True),
            (self.new_cred, "revoke_pending", True),
            (self.new_cred, "scopes_json", '["broader"]'),
            (self.new_cred, "calendar_ids_json", '["primary"]'),
            (self.new_cred, "organization_id", "another-org"),
            (self.new, "status", "revoked"),
            (self.action, "attempts", 2),
            (self.action, "approved_input_sha256", "changed"),
            (self.action, "input_json", "changed"),
        ]
        for obj, field, bad in mutations:
            old = getattr(obj, field)
            with self.subTest(field=field):
                setattr(obj, field, bad)
                with self.assertRaises(m.Incomplete): self.backend.load()
                setattr(obj, field, old)

    def test_usable_delegates_to_existing_runtime_cas_without_force(self):
        calls = []
        self.runtime._usable_tokens = lambda *args, **kwargs: calls.append((args, kwargs)) or {"access_token": "synthetic"}
        result = self.backend.usable(self.new_cred)
        self.assertEqual(result["access_token"], "synthetic")
        self.assertEqual(calls, [((self.backend.database, self.backend.settings, self.backend.provider, self.new_cred), {})])

    def test_expiry_returns_only_timestamp_and_drops_token_references(self):
        tokens = {"access_token": "synthetic", "expires_at": "2026-10-15T12:00:00+00:00"}
        self.runtime.decrypt_credentials = lambda *args: tokens
        self.assertIsInstance(self.backend.expiry(self.new_cred), float)
        self.assertEqual(tokens, {})


class RealTTYTests(unittest.TestCase):
    def test_hidden_prompt_restores_real_pty_on_success_interrupt_and_signal(self):
        source = (HERE / "io.mjs").resolve().as_uri()
        code = (f'import {{hiddenJSON}} from {json.dumps(source)}; '
                'try { await hiddenJSON({timeoutMs:2000}); console.log("SAFE_DONE"); } '
                'catch { console.log("SAFE_STOP"); }')
        for ending in ["success", "ctrl-c", "sigterm"]:
            with self.subTest(ending=ending):
                master, slave = pty.openpty()
                before = termios.tcgetattr(slave)
                child = subprocess.Popen(["node", "--input-type=module", "-e", code],
                    stdin=slave, stdout=slave, stderr=slave, close_fds=True)
                transcript = b""
                try:
                    deadline = time.monotonic() + 3
                    while b"then Enter:" not in transcript and time.monotonic() < deadline:
                        if select.select([master], [], [], .1)[0]:
                            transcript += os.read(master, 4096)
                    self.assertIn(b"then Enter:", transcript)
                    self.assertFalse(termios.tcgetattr(slave)[3] & termios.ECHO)
                    if ending == "success": os.write(master, b'{"token":"synthetic-never-echo"}\r')
                    elif ending == "ctrl-c": os.write(master, b"\x03")
                    else: child.send_signal(signal.SIGTERM)
                    child.wait(timeout=3)
                    while select.select([master], [], [], 0)[0]:
                        transcript += os.read(master, 4096)
                    self.assertNotIn(b"synthetic-never-echo", transcript)
                    after = termios.tcgetattr(slave)
                    self.assertEqual(before, after)
                    self.assertIn(b"SAFE_DONE" if ending == "success" else b"SAFE_STOP", transcript)
                finally:
                    if child.poll() is None:
                        child.kill()
                        child.wait(timeout=3)
                    os.close(master)
                    os.close(slave)


if __name__ == "__main__":
    unittest.main()
