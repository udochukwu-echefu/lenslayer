"""Real API/DB/worker tests with only Google's HTTP transport replaced."""
import copy
import json
import unittest
from datetime import timedelta
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

import httpx
from cryptography.fernet import Fernet
from sqlalchemy import select

from backend.app.agent_models import AgentAction, AgentRun, AgentRunEvent
from backend.app.agent_runtime import claim_next_agent_action, expire_agent_runs
from backend.app.calendar_connector import CALENDAR_SCOPE, GoogleCalendarHTTP
from backend.app.connector_models import CalendarCredential
from backend.app.models import IntegrationConnection, PlatformAuditEvent, utcnow
from backend.app.service_domains.common import aware
from tests import test_agent_infrastructure as fixtures


class FakeGoogle:
    def __init__(self):
        self.events = {}
        self.calls = []
        self.posts = 0
        self.timeout_after_write = False
        self.unreadable_after_write = False
        self.before_insert = None
        self.after_insert = None
        self.refresh_error = None
        self.refresh_scope = CALENDAR_SCOPE
        self.revoke_ok = True
        self.token_body = None
        self.event_body = None
        self.duplicate_insert = False
        self.token_invalid_json = False
        self.event_invalid_json = False
        self.reject_access_once = False
        self.before_first_get = None
        self.initial_read_failure = None

    def handle(self, request):
        self.calls.append((request.method, str(request.url)))
        if request.url.path == "/token":
            if self.token_invalid_json:
                return httpx.Response(200, content=b"{invalid json")
            if self.token_body is not None:
                return httpx.Response(200, json=self.token_body)
            data = parse_qs(request.content.decode())
            if data.get("grant_type") == ["refresh_token"] and self.refresh_error:
                return httpx.Response(400, json={"error": self.refresh_error, "secret": "do-not-leak"})
            return httpx.Response(200, json={"access_token": "fake-access-secret", "refresh_token": "fake-refresh-secret",
                "expires_in": 3600, "token_type": "Bearer", "scope": self.refresh_scope})
        if request.url.path == "/revoke":
            return httpx.Response(200 if self.revoke_ok else 503)
        if request.method == "POST":
            self.posts += 1
            if self.before_insert:
                self.before_insert()
            body = json.loads(request.content)
            self.events[(request.url.path, body["id"])] = body
            if self.after_insert:
                self.after_insert()
            if self.timeout_after_write:
                raise httpx.ReadTimeout("contains-secret-provider-details", request=request)
            return httpx.Response(409 if self.duplicate_insert else 200, json=body)
        collection, _, event_id = request.url.path.rpartition("/")
        if self.initial_read_failure == "http":
            return httpx.Response(503, json={"error": "must-not-be-exposed"})
        if self.initial_read_failure == "shape":
            return httpx.Response(200, json=["must-not-be-exposed"])
        if self.initial_read_failure == "json":
            return httpx.Response(200, content=b"{invalid json")
        if self.initial_read_failure == "timeout":
            raise httpx.ReadTimeout("must-not-be-exposed", request=request)
        if self.reject_access_once:
            self.reject_access_once = False
            return httpx.Response(401)
        if self.before_first_get:
            callback, self.before_first_get = self.before_first_get, None
            callback()
        if self.posts and self.event_invalid_json:
            return httpx.Response(200, content=b"{invalid json")
        if self.posts and self.unreadable_after_write:
            return httpx.Response(503, json={"error": "provider-private-details"})
        if self.posts and self.event_body is not None:
            return httpx.Response(200, json=self.event_body)
        event = self.events.get((collection, event_id))
        return httpx.Response(200, json=event) if event else httpx.Response(404)


class CalendarWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.AgentInfrastructureTests(methodName="runTest")
        self.fixture.setUp()
        self.settings.google_calendar_client_id = "fake-client"
        self.settings.google_calendar_client_secret = "fake-client-secret"
        self.settings.google_calendar_redirect_uri = "http://localhost:3000/calendar/oauth-return"
        self.settings.connector_encryption_key = Fernet.generate_key().decode()
        self.settings.connector_state_signing_key = "local-test-signing-key-not-for-production" * 2
        self.fake = FakeGoogle()
        factory = lambda settings: GoogleCalendarHTTP(settings, transport=httpx.MockTransport(self.fake.handle))
        self.patches = [patch("backend.app.service_domains.calendar.GoogleCalendarHTTP", factory),
                        patch("backend.app.calendar_runtime.GoogleCalendarHTTP", factory)]
        for item in self.patches:
            item.start()

    def __getattr__(self, name):
        fixture = self.__dict__.get("fixture")
        if fixture is None:
            raise AttributeError(name)
        return getattr(fixture, name)

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.fixture.tearDown()

    def oauth_start(self, headers=None):
        response = self.client.post(self.base + "/calendar/oauth/start", headers=headers or self.alice,
            json={"display_name": "Sandbox Calendar", "calendar_id": "sandbox@example.com"})
        self.assertEqual(response.status_code, 200, response.text)
        state = parse_qs(urlparse(response.json()["authorization_url"]).query)["state"][0]
        return state

    def connection(self):
        response = self.client.post(self.base + "/calendar/oauth/callback", headers=self.alice,
                                   json={"state": self.oauth_start(), "code": "fake-code"})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def calendar_workflow(self, approval=False, composite=False):
        connection = self.connection()
        target = {"connection_id": connection["id"], "calendar_id": "sandbox@example.com"}
        tools = ["documents.retrieve", "google_calendar.events.create"]
        if composite:
            tools.append("workspace.tasks.create")
        agent, headers = self.agent(allowed_tools=tools, calendar_targets=[target], max_actions_per_run=2,
                                    require_approval=approval)
        condition = {"type": "calendar_event_created", **target, "summary": "Renewal reminder",
                     "start_at": self.due, "end_at": "2026-12-01T10:00:00Z"}
        success = {"type": "all", "conditions": [
            {"id": "task", "condition": self.run_payload()["success_condition"]},
            {"id": "calendar", "condition": condition}]} if composite else condition
        response = self.client.post("/api/v1/agent/workflows", headers=headers, json=self.run_payload(
            allowed_tools=tools, calendar_targets=[target], max_actions=2 if composite else 1, success_condition=success))
        self.assertEqual(response.status_code, 201, response.text)
        run = response.json()
        evidence = self.evidence(headers, run["id"])
        action = {"idempotency_key": "calendar-001", "tool": "google_calendar.events.create", "tool_version": "1",
                  "input": {**condition, "description": "Review renewal", "contract_id": self.contract,
                            "evidence_id": evidence["id"]}}
        if composite:
            action["input"]["condition_id"] = "calendar"
        return connection, agent, headers, run, evidence, action

    def propose_calendar(self, headers, run, payload):
        response = self.client.post(f"/api/v1/agent/runs/{run['id']}/tool-actions", headers=headers, json=payload)
        self.assertEqual(response.status_code, 202, response.text)
        return response.json()

    def read_run(self, headers, run):
        return self.client.get(f"/api/v1/agent/runs/{run['id']}", headers=headers).json()

    def test_oauth_signed_one_time_state_tenant_human_binding_and_redaction(self):
        state = self.oauth_start()
        other, other_id = self.member("admin")
        callback = self.base + "/calendar/oauth/callback"
        self.assertEqual(self.client.post(callback, headers=other, json={"state": state, "code": "fake"}).status_code, 400)
        self.assertEqual(self.client.post(callback, headers=self.alice, json={"state": state + "x", "code": "fake"}).status_code, 400)
        response = self.client.post(callback, headers=self.alice, json={"state": state, "code": "fake"})
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(self.client.post(callback, headers=self.alice, json={"state": state, "code": "fake"}).status_code, 409)
        self.assertEqual(sum(path.endswith("/token") for _, path in self.fake.calls), 1)
        self.assertNotIn("fake-access-secret", response.text)
        self.assertNotIn("fake-refresh-secret", response.text)
        with self.database.session_factory() as session:
            credential = session.get(CalendarCredential, response.json()["id"])
            self.assertNotIn("fake-access-secret", credential.encrypted_json)
            public = session.get(IntegrationConnection, credential.connection_id)
            self.assertNotIn("fake-access-secret", public.settings_json)
            audits = session.scalars(select(PlatformAuditEvent)).all()
            self.assertNotIn("fake-refresh-secret", str([a.detail_json for a in audits]))
        from backend.app.models import Membership
        with self.database.session_factory() as session:
            session.scalar(select(Membership).where(Membership.organization_id == self.org, Membership.user_id == other_id)).role = "viewer"
            session.commit()
        viewer = other
        self.assertEqual(self.client.post(self.base + "/calendar/oauth/start", headers=viewer,
            json={"display_name": "bad", "calendar_id": "sandbox@example.com"}).status_code, 403)

    def test_configuration_and_open_redirect_fail_closed(self):
        self.settings.connector_encryption_key = ""
        response = self.client.post(self.base + "/calendar/oauth/start", headers=self.alice,
            json={"display_name": "test", "calendar_id": "sandbox@example.com"})
        self.assertEqual(response.status_code, 503)
        self.assertFalse(self.fake.calls)
        self.settings.connector_encryption_key = Fernet.generate_key().decode()
        self.assertEqual(self.client.post(self.base + "/calendar/oauth/start", headers=self.alice,
            json={"display_name": "test", "calendar_id": "sandbox@example.com", "redirect_uri": "https://evil.example"}).status_code, 422)

    def test_verified_event_intent_provenance_approval_and_read_back(self):
        _, _, headers, run, evidence, payload = self.calendar_workflow(approval=True)
        action = self.propose_calendar(headers, run, payload)
        self.assertIsNone(claim_next_agent_action(self.database, self.settings))
        self.assertEqual(self.approve(run["id"], action["id"]).status_code, 200)
        def check_committed_intent():
            with self.database.session_factory() as session:
                row = session.get(AgentAction, action["id"])
                self.assertTrue(row.dispatch_started_at)
                self.assertIn("lenslayer_source", row.dispatch_intent_json)
                self.assertEqual(row.status, "running")
        self.fake.before_insert = check_committed_intent
        self.assertTrue(self.process(claim_next_agent_action(self.database, self.settings)))
        result = self.read_run(headers, run)
        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(result["result"]["verification_method"], "google_events_get")
        self.assertEqual(result["result"]["evidence_id"], evidence["id"])
        self.assertRegex(result["result"]["event_id"], r"^[0-9a-v]{5,1024}$")
        self.assertEqual(self.fake.posts, 1)
        self.assertEqual(self.propose_calendar(headers, run, payload)["id"], action["id"])
        events = self.client.get(f"/api/v1/agent/runs/{run['id']}/events", headers=headers).json()
        self.assertNotIn("fake-access-secret", str(events))
        self.assertNotIn("renewal notice", str(events))

    def test_timeout_after_effect_is_reconciled_without_duplicate_insert(self):
        _, _, headers, run, _, payload = self.calendar_workflow()
        self.propose_calendar(headers, run, payload)
        self.fake.timeout_after_write = True
        self.assertTrue(self.process(claim_next_agent_action(self.database, self.settings)))
        self.assertEqual(self.read_run(headers, run)["status"], "succeeded")
        self.assertEqual(self.fake.posts, 1)

    def test_ambiguous_read_back_stops_unknown_outcome(self):
        _, _, headers, run, _, payload = self.calendar_workflow()
        action = self.propose_calendar(headers, run, payload)
        self.fake.unreadable_after_write = True
        self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
        self.assertEqual(self.read_run(headers, run)["error_code"], "unknown_outcome")
        with self.database.session_factory() as session:
            row = session.get(AgentAction, action["id"])
            self.assertEqual(row.status, "unknown_outcome")
            self.assertNotIn("provider-private-details", row.result_json)
        self.assertIsNone(claim_next_agent_action(self.database, self.settings))

    def test_conflicting_existing_stable_id_is_not_owned_or_overwritten(self):
        _, _, headers, run, _, payload = self.calendar_workflow()
        action = self.propose_calendar(headers, run, payload)
        with self.database.session_factory() as session:
            event_id = "ll" + session.get(AgentAction, action["id"]).output_id.replace("-", "")
        self.fake.events[("/calendar/v3/calendars/sandbox@example.com/events", event_id)] = {"id": event_id, "summary": "Someone else's event"}
        self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
        self.assertEqual(self.fake.posts, 0)
        actions = self.client.get(f"/api/v1/agent/runs/{run['id']}/actions", headers=headers).json()
        self.assertEqual(actions[0]["error_code"], "provider_event_conflict")

    def test_stale_lease_cannot_commit_and_recovery_reads_only(self):
        _, _, headers, run, _, payload = self.calendar_workflow()
        action = self.propose_calendar(headers, run, payload)
        claim = claim_next_agent_action(self.database, self.settings)
        def expire_lease():
            with self.database.session_factory() as session:
                session.get(AgentAction, action["id"]).lease_expires_at = utcnow() - timedelta(seconds=1)
                session.commit()
        self.fake.after_insert = expire_lease
        self.assertFalse(self.process(claim))
        self.assertEqual(self.read_run(headers, run)["status"], "running")
        self.fake.after_insert = None
        recovered = claim_next_agent_action(self.database, self.settings)
        self.assertNotEqual(claim[1], recovered[1])
        self.assertFalse(self.process(claim))
        self.assertTrue(self.process(recovered))
        self.assertEqual(self.fake.posts, 1)

    def test_cancel_during_write_reports_partial_effect_without_run_success(self):
        _, _, headers, run, _, payload = self.calendar_workflow()
        self.propose_calendar(headers, run, payload)
        self.fake.after_insert = lambda: self.client.post(f"/api/v1/agent/runs/{run['id']}/cancel", headers=headers)
        self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
        self.assertEqual(self.read_run(headers, run)["status"], "cancelled")
        actions = self.client.get(f"/api/v1/agent/runs/{run['id']}/actions", headers=headers).json()
        self.assertTrue(actions[0]["result"]["partial_effect"])
        self.assertTrue(actions[0]["result"]["verified"])
        self.assertEqual(self.fake.posts, 1)

    def test_refresh_expiry_scope_change_and_disconnect_block_queued_writes(self):
        from backend.app.calendar_connector import decrypt_credentials, encrypt_credentials
        connection, _, headers, run, _, payload = self.calendar_workflow()
        action = self.propose_calendar(headers, run, payload)
        with self.database.session_factory() as session:
            row = session.get(CalendarCredential, connection["id"])
            tokens = decrypt_credentials(self.settings, row)
            tokens["expires_at"] = (utcnow() - timedelta(seconds=1)).isoformat()
            row.encrypted_json = encrypt_credentials(self.settings, row.connection_id, row.organization_id, tokens)
            session.commit()
        self.assertTrue(self.process(claim_next_agent_action(self.database, self.settings)))
        self.assertEqual(sum(path.endswith("/token") for _, path in self.fake.calls), 2)
        response = self.client.post(self.base + f"/calendar/connections/{connection['id']}/disconnect", headers=self.alice)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["provider_revocation_pending"])
        with self.database.session_factory() as session:
            self.assertEqual(session.get(CalendarCredential, connection["id"]).encrypted_json, "")

    def test_invalid_refresh_and_scope_change_revoke_connection(self):
        from backend.app.calendar_connector import decrypt_credentials, encrypt_credentials
        for failure in ("invalid_grant", "scope"):
            with self.subTest(failure=failure):
                self.fake.refresh_error = None
                self.fake.refresh_scope = CALENDAR_SCOPE
                connection, _, _, run, _, payload = self.calendar_workflow()
                # Each workflow belongs to a new agent, so idempotency keys remain valid.
                with self.database.session_factory() as session:
                    row = session.get(CalendarCredential, connection["id"])
                    tokens = decrypt_credentials(self.settings, row)
                    tokens["expires_at"] = (utcnow() - timedelta(seconds=1)).isoformat()
                    row.encrypted_json = encrypt_credentials(self.settings, row.connection_id, row.organization_id, tokens)
                    from backend.app.services import PlatformService
                    from backend.app.agent_models import AgentPrincipal
                    from backend.app.agent_schemas import WorkflowActionCreate
                    service = PlatformService(session, self.settings, self.store)
                    service.propose_agent_action(session.get(AgentPrincipal, run["agent_id"]), run["id"], WorkflowActionCreate.model_validate(payload))
                if failure == "scope":
                    self.fake.refresh_scope = "https://www.googleapis.com/auth/calendar"
                else:
                    self.fake.refresh_error = failure
                self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
                with self.database.session_factory() as session:
                    self.assertIsNotNone(session.get(CalendarCredential, connection["id"]).revoked_at)
        self.assertEqual(self.fake.posts, 0)

    def test_foreign_calendar_scope_and_revoked_queued_connection_are_denied(self):
        connection, _, headers, run, _, payload = self.calendar_workflow()
        invalid = copy.deepcopy(payload)
        invalid["input"]["calendar_id"] = "other@example.com"
        self.assertEqual(self.client.post(f"/api/v1/agent/runs/{run['id']}/tool-actions", headers=headers, json=invalid).status_code, 403)
        self.propose_calendar(headers, run, payload)
        self.fake.revoke_ok = False
        response = self.client.post(self.base + f"/calendar/connections/{connection['id']}/disconnect", headers=self.alice)
        self.assertTrue(response.json()["provider_revocation_pending"])
        self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
        self.assertEqual(self.fake.posts, 0)

    def test_composite_checkpoint_survives_restart_and_requires_every_condition(self):
        _, _, headers, run, evidence, calendar_payload = self.calendar_workflow(composite=True)
        task_payload = self.action_payload(evidence["id"], condition_id="task")
        task = self.client.post(f"/api/v1/agent/runs/{run['id']}/tool-actions", headers=headers, json=task_payload)
        self.assertEqual(task.status_code, 202, task.text)
        self.assertTrue(self.process(claim_next_agent_action(self.database, self.settings)))
        checkpoint = self.read_run(headers, run)
        self.assertEqual(checkpoint["status"], "running")
        self.assertFalse(checkpoint["result"]["verified"])
        self.assertEqual(set(checkpoint["result"]["completed_conditions"]), {"task"})
        duplicate = {**task_payload, "idempotency_key": "duplicate-condition"}
        self.assertEqual(self.client.post(f"/api/v1/agent/runs/{run['id']}/tool-actions", headers=headers, json=duplicate).status_code, 409)
        self.propose_calendar(headers, run, calendar_payload)
        self.assertTrue(self.process(claim_next_agent_action(self.database, self.settings)))
        checkpoint = self.read_run(headers, run)
        self.assertEqual(checkpoint["status"], "succeeded")
        self.assertEqual(set(checkpoint["result"]["completed_conditions"]), {"task", "calendar"})

    def test_structured_human_input_is_immutable_authorized_and_does_not_broaden_scope(self):
        _, _, headers, run, _, action = self.calendar_workflow()
        url = f"/api/v1/agent/runs/{run['id']}/input-requests"
        payload = {"idempotency_key": "input-1", "reason": "Confirm deadline assumptions", "responder": "human",
                   "expires_at": (utcnow() + timedelta(hours=1)).isoformat(),
                   "fields": [{"name": "notice_days", "type": "integer", "prompt": "Notice period in calendar days?"}]}
        response = self.client.post(url, headers=headers, json=payload)
        self.assertEqual(response.status_code, 201, response.text)
        request_id = response.json()["id"]
        self.assertEqual(self.read_run(headers, run)["status"], "awaiting_input")
        self.assertEqual(self.client.post(f"/api/v1/agent/runs/{run['id']}/tool-actions", headers=headers, json=action).status_code, 409)
        self.assertEqual(self.client.post(url + f"/{request_id}/supply", headers=headers, json={"values": {"notice_days": 30}}).status_code, 403)
        human = self.base + f"/agent-runs/{run['id']}/input-requests/{request_id}/supply"
        viewer, _ = self.member()
        self.assertEqual(self.client.post(human, headers=viewer, json={"values": {"notice_days": 30}}).status_code, 403)
        self.assertEqual(self.client.post(human, headers=self.alice, json={"values": {"notice_days": "30"}}).status_code, 422)
        supplied = self.client.post(human, headers=self.alice, json={"values": {"notice_days": 30}})
        self.assertEqual(supplied.status_code, 200, supplied.text)
        self.assertEqual(supplied.json()["supplied_by_user_id"], self.owner)
        self.assertEqual(self.client.post(human, headers=self.alice, json={"values": {"notice_days": 31}}).status_code, 409)
        changed = copy.deepcopy(action)
        changed["input"]["summary"] = "A different action"
        self.assertEqual(self.client.post(f"/api/v1/agent/runs/{run['id']}/tool-actions", headers=headers, json=changed).status_code, 422)
        self.assertEqual(self.read_run(headers, run)["status"], "running")

    def test_agent_input_and_expired_input_deadline_are_bounded(self):
        from backend.app.agent_models import AgentInputRequest
        _, _, headers, run, _, _ = self.calendar_workflow()
        url = f"/api/v1/agent/runs/{run['id']}/input-requests"
        payload = {"idempotency_key": "input", "reason": "Client factual input", "responder": "agent",
                   "expires_at": (utcnow() + timedelta(minutes=1)).isoformat(),
                   "fields": [{"name": "confirmation", "type": "boolean", "prompt": "Is the source interpretation confirmed?"}]}
        response = self.client.post(url, headers=headers, json=payload)
        request_id = response.json()["id"]
        self.assertEqual(self.client.post(url + f"/{request_id}/supply", headers=headers, json={"values": {"confirmation": True}}).status_code, 200)
        payload["idempotency_key"] = "input-2"
        request_id = self.client.post(url, headers=headers, json=payload).json()["id"]
        with self.database.session_factory() as session:
            session.get(AgentInputRequest, request_id).expires_at = utcnow() - timedelta(seconds=1)
            session.commit()
        self.assertEqual(expire_agent_runs(self.database, self.settings, self.store), 1)
        self.assertEqual(self.read_run(headers, run)["error_code"], "input_expired")

    def test_legacy_task_timestamps_are_explicit_utc_preserving_instants(self):
        _, _, _, _, _ = self.workflow(False)
        self.assertTrue(self.process(claim_next_agent_action(self.database, self.settings)))
        task = self.client.get(self.base + "/tasks", headers=self.alice).json()[0]
        from datetime import datetime, timezone
        self.assertEqual(datetime.fromisoformat(task["due_at"].replace("Z", "+00:00")),
                         datetime(2026, 12, 1, 9, tzinfo=timezone.utc))
        for field in ("due_at", "created_at", "updated_at"):
            self.assertIsNotNone(datetime.fromisoformat(task[field].replace("Z", "+00:00")).tzinfo)

    def test_calendar_only_goal_needs_no_contract_or_evidence(self):
        connection = self.connection()
        target = {"connection_id": connection["id"], "calendar_id": "sandbox@example.com"}
        _, headers = self.agent(contract_ids=[], assignee_ids=[], calendar_targets=[target],
                                allowed_tools=["google_calendar.events.create"], require_approval=True)
        condition = {"type": "calendar_event_created", **target, "summary": "Independent appointment",
                     "start_at": self.due, "end_at": "2026-12-01T10:00:00Z"}
        response = self.client.post("/api/v1/agent/workflows", headers=headers, json={
            "idempotency_key": "calendar-only", "goal": "Create my approved appointment", "contract_ids": [],
            "calendar_targets": [target], "allowed_tools": ["google_calendar.events.create"], "max_actions": 1,
            "deadline_at": (utcnow() + timedelta(hours=1)).isoformat(), "success_condition": condition})
        self.assertEqual(response.status_code, 201, response.text)
        run = response.json()
        action = self.propose_calendar(headers, run, {"idempotency_key": "appointment", "tool": "google_calendar.events.create", "input": condition})
        self.assertEqual(self.approve(run["id"], action["id"]).status_code, 200)
        self.assertTrue(self.process(claim_next_agent_action(self.database, self.settings)))
        result = self.read_run(headers, run)["result"]
        self.assertEqual(result["provenance_origin"], "approved_action")
        self.assertNotIn("evidence_id", result)
        self.assertNotIn("lenslayer_source", str(self.fake.events))

    def test_malformed_token_shapes_are_rejected_without_persisting_credentials(self):
        for value in ([], "not an object", {"access_token": "", "token_type": "Bearer", "scope": CALENDAR_SCOPE},
                      {"access_token": "fake", "refresh_token": "fake", "token_type": "Bearer", "scope": CALENDAR_SCOPE, "expires_in": True}):
            with self.subTest(value=value):
                self.fake.token_body = value
                state = self.oauth_start()
                response = self.client.post(self.base + "/calendar/oauth/callback", headers=self.alice, json={"state": state, "code": "fake"})
                self.assertEqual(response.status_code, 409, response.text)
        with self.database.session_factory() as session:
            self.assertEqual(session.scalars(select(CalendarCredential)).all(), [])

    def test_malformed_event_shape_is_unknown_never_success(self):
        _, _, headers, run, _, payload = self.calendar_workflow()
        self.propose_calendar(headers, run, payload)
        self.fake.event_body = ["malformed"]
        self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
        self.assertEqual(self.read_run(headers, run)["error_code"], "unknown_outcome")

    def test_naive_or_malformed_provider_dates_and_nested_fields_are_rejected(self):
        for mutation in ("naive", "invalid-date", "nested-list"):
            with self.subTest(mutation=mutation):
                _, _, headers, run, _, payload = self.calendar_workflow()
                self.propose_calendar(headers, run, payload)
                def corrupt_event():
                    event = list(self.fake.events.values())[-1]
                    if mutation == "naive":
                        event["start"]["dateTime"] = event["start"]["dateTime"].replace("+00:00", "")
                    elif mutation == "invalid-date":
                        event["start"]["dateTime"] = "not a date"
                    else:
                        event["extendedProperties"] = []
                self.fake.after_insert = corrupt_event
                self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
                self.assertNotEqual(self.read_run(headers, run)["status"], "succeeded")

    def test_metrics_and_worker_readiness_are_tenant_scoped(self):
        _, _, headers, run, _, payload = self.calendar_workflow()
        self.propose_calendar(headers, run, payload)
        self.assertEqual(self.client.get("/health/worker").status_code, 503)
        from backend.app.worker import run_worker
        run_worker(self.settings, once=True)
        self.assertEqual(self.client.get("/health/worker").status_code, 200)
        metrics = self.client.get(self.base + "/agent-metrics", headers=self.alice)
        self.assertEqual(metrics.status_code, 200, metrics.text)
        self.assertEqual(metrics.json()["actions_by_status"]["succeeded"], 1)
        self.assertEqual(metrics.json()["event_counters"]["action.dispatched"], 1)
        viewer, _ = self.member()
        self.assertEqual(self.client.get(self.base + "/agent-metrics", headers=viewer).status_code, 403)
        self.assertEqual(self.client.get(self.base + "/agent-metrics", headers=headers).status_code, 401)

    def test_pre_extension_run_and_approved_action_hashes_survive_replay_and_dispatch(self):
        """Seed actual legacy canonical dictionaries, not new-schema dumps."""
        from datetime import datetime, timezone
        from backend.app.agent_models import AgentPrincipal
        from backend.app.service_domains.agents import canonical_json, digest
        agent, headers = self.agent(require_approval=True)
        old_request = self.run_payload()
        # The original Pydantic JSON serializer emitted UTC as Z, not +00:00.
        old_request["deadline_at"] = datetime.fromisoformat(old_request["deadline_at"]).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        old_request["success_condition"]["due_at"] = datetime.fromisoformat(self.due.replace("Z", "+00:00")).isoformat().replace("+00:00", "Z")
        self.assertNotIn("calendar_targets", old_request)
        with self.database.session_factory() as session:
            legacy_run = AgentRun(organization_id=self.org, agent_id=agent["id"], idempotency_key=old_request["idempotency_key"],
                request_sha256=digest(canonical_json(old_request)), goal=old_request["goal"],
                contract_ids_json=canonical_json(old_request["contract_ids"]), allowed_tools_json=canonical_json(old_request["allowed_tools"]),
                success_condition_json=canonical_json(old_request["success_condition"]), max_actions=old_request["max_actions"],
                status="running", deadline_at=datetime.fromisoformat(old_request["deadline_at"]))
            session.add(legacy_run)
            session.commit()
            run_id = legacy_run.id
        for route, replay in (("/api/v1/agent/runs", old_request),
                               ("/api/v1/agent/workflows", {**old_request, "calendar_targets": []})):
            response = self.client.post(route, headers=headers, json=replay)
            self.assertEqual(response.status_code, 201, response.text)
            self.assertEqual(response.json()["id"], run_id)
        evidence = self.evidence(headers, run_id)
        old_action = self.action_payload(evidence["id"])
        old_action["input"]["due_at"] = old_request["success_condition"]["due_at"]
        old_serialized = canonical_json(old_action["input"])
        self.assertNotIn("condition_id", old_serialized)
        old_hash = digest(old_serialized)
        with self.database.session_factory() as session:
            legacy_action = AgentAction(run_id=run_id, idempotency_key=old_action["idempotency_key"], tool=old_action["tool"],
                tool_version="1", input_json=old_serialized, input_sha256=old_hash, status="queued", approval_status="approved",
                approved_input_sha256=old_hash, approved_by_user_id=self.owner, approval_reason="Legacy approval",
                approval_expires_at=utcnow() + timedelta(minutes=30))
            session.add(legacy_action)
            session.commit()
            action_id = legacy_action.id
        response = self.client.post(f"/api/v1/agent/runs/{run_id}/actions", headers=headers, json=old_action)
        self.assertEqual(response.status_code, 202, response.text)
        self.assertEqual(response.json()["id"], action_id)
        self.assertTrue(self.process(claim_next_agent_action(self.database, self.settings)))
        with self.database.session_factory() as session:
            row = session.get(AgentAction, action_id)
            self.assertEqual(row.input_json, old_serialized)
            self.assertEqual(row.input_sha256, old_hash)
            self.assertEqual(row.approved_input_sha256, old_hash)
            self.assertEqual(session.get(AgentRun, run_id).status, "succeeded")

    def test_duplicate_409_is_verified_by_get_not_new_id_or_update(self):
        _, _, headers, run, _, payload = self.calendar_workflow()
        self.propose_calendar(headers, run, payload)
        self.fake.duplicate_insert = True
        self.assertTrue(self.process(claim_next_agent_action(self.database, self.settings)))
        self.assertEqual(self.fake.posts, 1)
        self.assertEqual(self.read_run(headers, run)["status"], "succeeded")

    def test_invalid_json_and_401_refresh_are_bounded_and_redacted(self):
        self.fake.token_invalid_json = True
        state = self.oauth_start()
        response = self.client.post(self.base + "/calendar/oauth/callback", headers=self.alice, json={"state": state, "code": "fake"})
        self.assertEqual(response.status_code, 409)
        self.fake.token_invalid_json = False
        _, _, headers, run, _, payload = self.calendar_workflow()
        self.propose_calendar(headers, run, payload)
        self.fake.reject_access_once = True
        self.assertTrue(self.process(claim_next_agent_action(self.database, self.settings)))
        self.assertEqual(self.fake.posts, 1)
        _, _, headers, run, _, payload = self.calendar_workflow()
        self.propose_calendar(headers, run, payload)
        self.fake.after_insert = lambda: setattr(self.fake, "event_invalid_json", True)
        self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
        self.assertEqual(self.read_run(headers, run)["error_code"], "unknown_outcome")

    def test_cancel_before_insert_fence_prevents_the_write(self):
        _, _, headers, run, _, payload = self.calendar_workflow()
        self.propose_calendar(headers, run, payload)
        self.fake.before_first_get = lambda: self.client.post(f"/api/v1/agent/runs/{run['id']}/cancel", headers=headers)
        self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
        self.assertEqual(self.fake.posts, 0)
        self.assertEqual(self.read_run(headers, run)["status"], "cancelled")

    def test_unknown_outcome_operator_reconciliation_is_read_only_and_bounded(self):
        _, _, headers, run, _, payload = self.calendar_workflow()
        action = self.propose_calendar(headers, run, payload)
        self.fake.unreadable_after_write = True
        self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
        self.fake.unreadable_after_write = False
        route = self.base + f"/agent-runs/{run['id']}/actions/{action['id']}/reconcile"
        self.assertEqual(self.client.post(route, headers=headers).status_code, 401)
        response = self.client.post(route, headers=self.alice)
        self.assertEqual(response.status_code, 202, response.text)
        self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
        self.assertEqual(self.fake.posts, 1)
        self.assertEqual(self.read_run(headers, run)["status"], "failed")
        actions = self.client.get(f"/api/v1/agent/runs/{run['id']}/actions", headers=headers).json()
        self.assertTrue(actions[0]["result"]["verified"])
        self.assertTrue(actions[0]["result"]["partial_effect"])

    def test_oauth_and_calendar_grants_cannot_cross_tenants(self):
        connection = self.connection()
        state = self.oauth_start()
        outsider = {"X-LensLayer-User": "calendar-outsider", "X-LensLayer-Email": "outsider@example.test"}
        other_org = self.client.post("/api/v1/organizations", headers=outsider,
            json={"name": "Other calendar tenant", "slug": "other-calendar"}).json()["id"]
        other = f"/api/v1/organizations/{other_org}"
        token_calls = sum(path.endswith("/token") for _, path in self.fake.calls)
        self.assertEqual(self.client.post(other + "/calendar/oauth/callback", headers=outsider,
            json={"state": state, "code": "fake"}).status_code, 400)
        self.assertEqual(self.client.post(other + "/agents", headers=outsider, json=self.agent_payload(
            contract_ids=[], assignee_ids=[], allowed_tools=["google_calendar.events.create"],
            calendar_targets=[{"connection_id": connection["id"], "calendar_id": "sandbox@example.com"}])).status_code, 409)
        self.assertEqual(self.client.post(other + f"/calendar/connections/{connection['id']}/disconnect", headers=outsider).status_code, 404)
        self.assertEqual(sum(path.endswith("/token") for _, path in self.fake.calls), token_calls)
        self.assertEqual(self.client.get(other + "/calendar/provider", headers=outsider).json()["configured"], False)

    def test_provenance_pair_wrong_condition_and_queued_source_retention(self):
        _, _, headers, run, _, payload = self.calendar_workflow(composite=True)
        wrong = copy.deepcopy(payload)
        wrong["input"]["condition_id"] = "task"
        route = f"/api/v1/agent/runs/{run['id']}/tool-actions"
        self.assertEqual(self.client.post(route, headers=headers, json=wrong).status_code, 422)
        wrong = copy.deepcopy(payload)
        wrong["input"].pop("evidence_id")
        self.assertEqual(self.client.post(route, headers=headers, json=wrong).status_code, 422)
        self.propose_calendar(headers, run, payload)
        from backend.app.models import ContractVersion
        with self.database.session_factory() as session:
            session.get(ContractVersion, self.version).extracted_text = None
            session.commit()
        self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
        self.assertEqual(self.fake.posts, 0)

    def test_reconciliation_attempt_limit_prevents_unbounded_reads(self):
        _, _, headers, run, _, payload = self.calendar_workflow()
        action = self.propose_calendar(headers, run, payload)
        self.fake.unreadable_after_write = True
        self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
        with self.database.session_factory() as session:
            session.get(AgentAction, action["id"]).attempts = self.settings.agent_action_max_attempts
            session.commit()
        response = self.client.post(self.base + f"/agent-runs/{run['id']}/actions/{action['id']}/reconcile", headers=self.alice)
        self.assertEqual(response.status_code, 409)
        self.assertIsNone(claim_next_agent_action(self.database, self.settings))
        self.assertEqual(self.fake.posts, 1)

    def test_failed_initial_get_has_no_dispatch_marker_or_uncertain_write(self):
        for failure, code in (("http", "provider_read_failed"), ("timeout", "provider_read_failed"),
                              ("shape", "provider_response_invalid"), ("json", "provider_response_invalid")):
            with self.subTest(failure=failure):
                self.fake.initial_read_failure = None
                _, _, headers, run, _, payload = self.calendar_workflow()
                action = self.propose_calendar(headers, run, payload)
                self.fake.initial_read_failure = failure
                self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
                result = self.read_run(headers, run)
                self.assertEqual(result["status"], "failed")
                self.assertEqual(result["error_code"], code)
                with self.database.session_factory() as session:
                    record = session.get(AgentAction, action["id"])
                    self.assertEqual(record.status, "failed")
                    self.assertEqual(record.error_code, code)
                    self.assertIsNone(record.dispatch_started_at)
                    receipt = json.loads(record.result_json)
                    self.assertFalse(receipt["dispatch_may_have_effect"])
                    self.assertEqual(receipt["reconciliation_error"], code)
                    self.assertNotIn("must-not-be-exposed", record.result_json)
                self.assertEqual(self.client.post(self.base + f"/agent-runs/{run['id']}/actions/{action['id']}/reconcile",
                    headers=self.alice).status_code, 409)
        self.assertEqual(self.fake.posts, 0)

    def test_read_failure_after_dispatch_stays_unknown_and_reconciliation_never_inserts(self):
        for failure in ("http", "timeout", "shape", "json"):
            with self.subTest(failure=failure):
                self.fake.initial_read_failure = None
                self.fake.after_insert = None
                _, _, headers, run, _, payload = self.calendar_workflow()
                action = self.propose_calendar(headers, run, payload)
                before_posts = self.fake.posts
                self.fake.after_insert = lambda: setattr(self.fake, "initial_read_failure", failure)
                self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
                with self.database.session_factory() as session:
                    record = session.get(AgentAction, action["id"])
                    self.assertEqual(record.status, "unknown_outcome")
                    self.assertIsNotNone(record.dispatch_started_at)
                    marker = record.dispatch_started_at
                    self.assertTrue(json.loads(record.result_json)["dispatch_may_have_effect"])
                self.fake.after_insert = None
                route = self.base + f"/agent-runs/{run['id']}/actions/{action['id']}/reconcile"
                self.assertEqual(self.client.post(route, headers=self.alice).status_code, 202)
                self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
                self.assertEqual(self.fake.posts, before_posts + 1)
                self.assertEqual(self.read_run(headers, run)["error_code"], "unknown_outcome")
                with self.database.session_factory() as session:
                    record = session.get(AgentAction, action["id"])
                    self.assertEqual(record.status, "unknown_outcome")
                    self.assertEqual(record.dispatch_started_at, marker)
                # Even a later 404 cannot erase conservative dispatch intent or
                # cause recovery to create a replacement event.
                self.fake.initial_read_failure = None
                self.fake.events.clear()
                self.assertEqual(self.client.post(route, headers=self.alice).status_code, 202)
                self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
                self.assertEqual(self.fake.posts, before_posts + 1)
                with self.database.session_factory() as session:
                    record = session.get(AgentAction, action["id"])
                    self.assertEqual(record.status, "unknown_outcome")
                    self.assertEqual(record.dispatch_started_at, marker)
                    self.assertTrue(json.loads(record.result_json)["dispatch_may_have_effect"])


class CalendarSandboxGuardTests(unittest.TestCase):
    def test_harness_refuses_missing_ack_or_primary_calendar_without_network(self):
        import os
        from backend.app.calendar_sandbox import run_sandbox
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "acknowledgment"):
                run_sandbox()
        with patch.dict(os.environ, {"LENSLAYER_SANDBOX_GOOGLE_ACK": "write_one_event_to_disposable_calendar",
                                     "LENSLAYER_SANDBOX_GOOGLE_CALENDAR_ID": "primary"}, clear=True):
            with self.assertRaisesRegex(ValueError, "secondary calendar"):
                run_sandbox()
