"""Real API/SQLite/immutable workers, synthetic trusted BFF proofs, fake HTTP only."""
import json
import unittest
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from pydantic import ValidationError
from sqlalchemy import select

from backend.app.config import Settings
from backend.app.connector_models import CalendarCredential, CalendarOAuthState, CalendarSessionProof
from backend.app.hosted_agent_models import HostedAgentTask
from backend.app.hosted_agent_service import model_available
from backend.app.models import IntegrationConnection, utcnow
from tests.calendar_test_session import proof
from tests import test_hosted_agents as fixtures


class ProviderSessionIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.HostedAgentTests(methodName="runTest")
        self.fixture.setUp()
        self.fixture.budget_patch.stop()  # real admission provider gate, not legacy fake OpenAI authorization
        # Bypass ONLY the test proof auto-attacher to test absent/forged proofs.
        from fastapi.testclient import TestClient
        self.raw = lambda method, route, **kwargs: TestClient.request(self.fixture.client, method, route, **kwargs)

    def tearDown(self):
        self.fixture.tearDown()

    def calendar_call(self, tail, body, *, session_id="synthetic-browser-session-1", subject="alice", org=None, overrides=None, signed=True):
        f = self.fixture
        org = org or f.org
        operation = tail if tail.startswith("oauth/") else "connections/disconnect"
        binding = body or {"connection_id": tail.split("/")[1]}
        headers = dict(f.alice)
        if signed:
            headers["X-LensLayer-Calendar-Session"] = proof(f.settings, subject, org, operation, binding, session_id=session_id, **(overrides or {}))
        return self.raw("POST", f"/api/v1/organizations/{org}/calendar/{tail}", headers=headers, json=body)

    def test_default_disabled_provider_gate_and_startup_bounds_make_no_discovery(self):
        with patch("httpx.Client", side_effect=AssertionError("Startup must not discover/call providers")):
            self.assertFalse(model_available(Settings(_env_file=None)))
            self.assertFalse(Settings(_env_file=None).google_calendar_enabled)
            for kwargs in ({"hosted_model_enabled": True}, {"hosted_model_provider": "arbitrary"},
                           {"hosted_model_timeout_seconds": 31}, {"hosted_agent_lease_seconds": 105, "hosted_model_enabled": True, "hosted_model_provider": "deepseek"},
                           {"calendar_session_binding_key": "short"}):
                with self.subTest(kwargs=kwargs), self.assertRaises(ValidationError):
                    Settings(_env_file=None, **kwargs)
        self.assertEqual(Settings(_env_file=None, hosted_agent_lease_seconds=30).hosted_agent_lease_seconds, 30)
        for selected in ("deepseek", "openai"):
            settings = Settings(_env_file=None, hosted_model_enabled=True, hosted_model_provider=selected, hosted_model_api_key="fake-product-only")
            self.assertTrue(model_available(settings))
            self.assertNotIn("fake-product-only", repr(settings))
            settings.hosted_model_provider = None
            self.assertFalse(model_available(settings))
        with self.assertRaises(ValidationError) as exc:
            Settings(_env_file=None, hosted_model_enabled=True, hosted_model_api_key="PRIVATE-STARTUP-SECRET")
        self.assertNotIn("PRIVATE-STARTUP-SECRET", str(exc.exception))

    def test_disclosed_selection_stale_expectation_and_immutable_checkpoint_metadata(self):
        f = self.fixture
        f.enable_model()
        f.settings.hosted_model_provider = "deepseek"
        f.settings.hosted_model_lifetime_call_limit = 1
        capabilities = f.client.get(f.base + "/hosted-agent-capabilities", headers=f.alice).json()
        self.assertEqual(capabilities["model_id"], "deepseek-flash")
        self.assertIn("DeepSeek", capabilities["model_disclosure"])
        self.assertIn("1,000", capabilities["model_disclosure"])
        payload = f.payload(planner_mode="model")
        f.settings.hosted_model_provider = "openai"
        self.assertEqual(f.client.post(f.route, headers=f.alice, json=payload).status_code, 409)
        f.settings.hosted_model_provider = "deepseek"
        task = f.create(payload)
        self.assertEqual((task["model_provider"], task["model_id"], task["model_reasoning_effort"]), ("deepseek", "deepseek-flash", "high"))
        self.assertNotIn("api_key", json.dumps(task))
        with f.database.session_factory() as session:
            row = session.get(HostedAgentTask, task["id"])
            self.assertEqual(len(row.model_selection_sha256), 64)
        f.settings.hosted_model_provider = "openai"
        with patch("backend.app.hosted_agent_model.decide", side_effect=AssertionError("No fallback")):
            f.step()
        self.assertEqual(f.read(task)["error_code"], "model_configuration_changed")
        self.assertIsNone(f.read(task)["run_id"])

    def test_selection_tamper_and_configuration_change_during_http_never_propose(self):
        f = self.fixture
        f.enable_model()
        f.settings.hosted_model_provider = "deepseek"
        for field in ("model_provider", "model_id", "model_reasoning_effort", "model_selection_sha256"):
            task = f.create(f.payload(planner_mode="model", idempotency_key=field))
            with f.database.session_factory() as session:
                setattr(session.get(HostedAgentTask, task["id"]), field, "changed")
                session.commit()
            f.step()
            self.assertEqual(f.read(task)["error_code"], "model_binding_changed")
        task = f.create(f.payload(planner_mode="model", idempotency_key="http-config-change"))
        f.step(); f.step()
        with f.fake_model(response={"model": "deepseek-flash", "status": "completed", "output": [
            {"type": "message", "role": "assistant", "status": "completed", "content": [{"type": "output_text", "text": '{"decision":"proceed"}'}]}]},
                callback=lambda: setattr(f.settings, "hosted_model_provider", "openai")):
            f.step()
        self.assertEqual(f.read(task)["error_code"], "model_configuration_changed")
        self.assertEqual(f.actions(f.read(task)), [])
        with f.database.session_factory() as session:
            self.assertEqual(session.get(HostedAgentTask, task["id"]).model_calls, 1)
        self.assertEqual(len(f.model_requests), 1)

    def test_missing_expired_wrong_subject_operation_body_or_key_proof_never_exchanges(self):
        body = {"display_name": "Synthetic", "calendar_id": "owned@group.calendar.google.com"}
        f = self.fixture
        self.assertEqual(self.calendar_call("oauth/start", body, signed=False).status_code, 403)
        now = int(utcnow().timestamp())
        for overrides in ({"sub": "auth0|other"}, {"org": "another-org"}, {"op": "oauth/callback"},
                          {"body_sha256": "0" * 64}, {"fp": "not-a-fingerprint"}, {"iat": now - 100, "nbf": now - 100, "exp": now - 40},
                          {"exp": now + 120}):
            with self.subTest(overrides=overrides):
                self.assertEqual(self.calendar_call("oauth/start", body, overrides=overrides).status_code, 403)
        self.assertEqual(f.fake.calls, [])
        key = f.settings.calendar_session_binding_key
        f.settings.calendar_session_binding_key = ""
        self.assertEqual(self.calendar_call("oauth/start", body, signed=False).status_code, 503)
        f.settings.calendar_session_binding_key = key

    def test_same_subject_other_browser_and_new_login_cannot_complete_old_state(self):
        f = self.fixture
        state = f.oauth_start()
        callback = {"state": state, "code": "fake-code"}
        for browser in ("other-browser", "new-login-after-logout"):
            self.assertEqual(self.calendar_call("oauth/callback", callback, session_id=browser).status_code, 400)
        self.assertEqual(sum(path.endswith("/token") for _, path in f.fake.calls), 0)
        success = self.calendar_call("oauth/callback", callback)
        self.assertEqual(success.status_code, 201)
        connection = success.json()
        self.assertEqual(connection["settings"]["identity_kind"], "oauth_grant")
        self.assertFalse(connection["settings"]["provider_account_verified"])
        self.assertFalse(connection["settings"]["calendar_ownership_verified"])
        self.assertNotIn("session_fingerprint", success.text)
        self.assertEqual(self.calendar_call("oauth/callback", callback).status_code, 409)
        with f.database.session_factory() as session:
            state_row = session.scalar(select(CalendarOAuthState).where(CalendarOAuthState.consumed_at.is_not(None)))
            credential = session.get(CalendarCredential, connection["id"])
            self.assertEqual(state_row.session_fingerprint, credential.session_fingerprint)
        self.assertEqual(sum(path.endswith("/token") for _, path in f.fake.calls), 1)

    def test_real_authenticated_oidc_subject_is_checked_not_caller_claimed_session_text(self):
        from backend.app.security import Principal
        f = self.fixture
        f.settings.auth_mode = "oidc"
        body = {"display_name": "Synthetic", "calendar_id": "owned@group.calendar.google.com"}
        with patch("backend.app.security._oidc_principal", return_value=Principal(subject="alice", email="alice@example.test", display_name="Alice")):
            self.assertEqual(self.calendar_call("oauth/start", body, subject="auth0|attacker").status_code, 403)
            self.assertEqual(self.calendar_call("oauth/start", body, subject="alice").status_code, 200)
        self.assertEqual(f.fake.calls, [])

    def test_attestation_nonce_replay_and_oauth_config_rotation_fail_closed(self):
        f = self.fixture
        body = {"display_name": "Synthetic", "calendar_id": "owned@group.calendar.google.com"}
        headers = {**f.alice, "X-LensLayer-Calendar-Session": proof(f.settings, "alice", f.org, "oauth/start", body)}
        route = f.base + "/calendar/oauth/start"
        first = self.raw("POST", route, headers=headers, json=body)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(self.raw("POST", route, headers=headers, json=body).status_code, 409)
        from urllib.parse import parse_qs, urlparse
        state = parse_qs(urlparse(first.json()["authorization_url"]).query)["state"][0]
        self.assertNotIn(".", state)  # opaque nonce, not a decoded session-bearing JWT
        f.settings.google_calendar_client_id = "changed-client"
        self.assertEqual(self.calendar_call("oauth/callback", {"state": state, "code": "fake"}).status_code, 400)
        self.assertEqual(f.fake.calls, [])

    def test_disconnect_needs_fresh_operation_proof_and_new_grant_reconnect(self):
        f = self.fixture
        connection = f.connection()
        tail = f"connections/{connection['id']}/disconnect"
        self.assertEqual(self.calendar_call(tail, {}, signed=False).status_code, 403)
        self.assertEqual(self.calendar_call(tail, {}).status_code, 200)
        with f.database.session_factory() as session:
            self.assertEqual(session.get(CalendarCredential, connection["id"]).encrypted_json, "")
        self.assertNotEqual(f.connection()["id"], connection["id"])
