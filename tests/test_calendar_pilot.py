"""Private pilot admission with synthetic users, local SQLite and fake Google only."""
import unittest
from datetime import timedelta

from backend.app.agent_models import AgentAction, AgentPrincipal
from backend.app.agent_runtime import claim_next_agent_action
from backend.app.calendar_eligibility import calendar_pilot_eligible
from backend.app.config import Settings
from backend.app.models import IntegrationConnection, utcnow
from tests import test_calendar_workflows as fixtures


class CalendarPilotConfigTests(unittest.TestCase):
    def test_defaults_preserve_nonpilot_behavior_without_enabling_calendar(self):
        settings = Settings(_env_file=None, environment="test")
        self.assertFalse(settings.google_calendar_enabled)
        self.assertFalse(settings.google_calendar_pilot_enabled)
        self.assertEqual(settings.google_calendar_pilot_user_ids, "")
        self.assertTrue(calendar_pilot_eligible(settings, "unlisted-staging-user"))

    def test_entire_allowlist_is_validated_as_exact_local_uuids(self):
        owner = "00000000-0000-4000-8000-000000000001"
        second = "00000000-0000-4000-8000-000000000002"
        settings = Settings(_env_file=None, environment="test", google_calendar_pilot_enabled=True,
                            google_calendar_pilot_user_ids=f" {owner}, {second} ")
        self.assertEqual(settings.google_calendar_pilot_user_id_set, {owner, second})
        self.assertTrue(calendar_pilot_eligible(settings, owner))
        self.assertFalse(calendar_pilot_eligible(settings, "00000000-0000-4000-8000-000000000003"))
        for value in ("", " ", "*", "auth0|synthetic", "owner@example.test", f"{owner},", f",{owner}",
                      f"{owner},*", f"{owner};{second}", owner.replace("-", ""), f"{owner},invalid"):
            with self.subTest(value=value):
                settings.google_calendar_pilot_user_ids = value
                self.assertFalse(settings.google_calendar_pilot_user_id_set)
                self.assertFalse(calendar_pilot_eligible(settings, owner))


class CalendarPilotWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.f = fixtures.CalendarWorkflowTests(methodName="runTest")
        self.f.setUp()
        self.f.settings.google_calendar_pilot_enabled = True
        self.f.settings.google_calendar_pilot_user_ids = self.f.owner

    def tearDown(self):
        self.f.tearDown()

    def test_allowed_owner_connects_and_writes_only_after_approval(self):
        f = self.f
        response = f.client.get(f.base + "/calendar/oauth/eligibility", headers=f.alice)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["configured"])
        self.assertEqual(response.headers["cache-control"], "no-store")
        _, _, headers, run, _, payload = f.calendar_workflow(approval=True)
        action = f.propose_calendar(headers, run, payload)
        self.assertIsNone(claim_next_agent_action(f.database, f.settings))
        self.assertEqual(f.approve(run["id"], action["id"]).status_code, 200)
        self.assertTrue(f.process(claim_next_agent_action(f.database, f.settings)))
        self.assertEqual(f.fake.posts, 1)
        event = next(iter(f.fake.events.values()))
        self.assertNotIn("attendees", event)
        self.assertEqual(event["reminders"], {"useDefault": False})

    def test_nonpilot_admin_cannot_connect_get_admission_or_delegate_owner_connection(self):
        f = self.f
        connection = f.connection()
        other, _ = f.member("admin")
        self.assertEqual(f.client.get(f.base + "/calendar/oauth/eligibility", headers=other).status_code, 403)
        self.assertFalse(f.client.get(f.base + "/calendar/provider", headers=other).json()["configured"])
        self.assertEqual(f.client.post(f.base + "/calendar/oauth/start", headers=other,
            json={"display_name": "Synthetic", "calendar_id": "sandbox@example.com"}).status_code, 403)
        target = {"connection_id": connection["id"], "calendar_id": "sandbox@example.com"}
        response = f.client.post(f.base + "/agents", headers=other, json=f.agent_payload(
            allowed_tools=["google_calendar.events.create"], calendar_targets=[target]))
        self.assertEqual(response.status_code, 403, response.text)
        condition = {"type": "calendar_event_created", **target, "summary": "Synthetic", "start_at": f.due,
                     "end_at": "2026-12-01T10:00:00Z"}
        response = f.client.post(f.base + "/hosted-agent-tasks", headers=other, json={
            "idempotency_key": "pilot-denied", "goal_type": "calendar-event", "goal": "Synthetic event",
            "deadline_at": (utcnow() + timedelta(hours=1)).isoformat(), "calendar": condition})
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(f.fake.posts, 0)

    def test_empty_or_malformed_allowlist_denies_before_state_or_provider_work(self):
        f = self.f
        for value in ("", f.owner + ",*", f.owner + ",", "auth0|synthetic"):
            with self.subTest(value=value):
                f.settings.google_calendar_pilot_user_ids = value
                self.assertEqual(f.client.get(f.base + "/calendar/oauth/eligibility", headers=f.alice).status_code, 403)
                response = f.client.post(f.base + "/calendar/oauth/start", headers=f.alice,
                    json={"display_name": "Synthetic", "calendar_id": "sandbox@example.com"})
                self.assertEqual(response.status_code, 403)
        self.assertEqual(f.fake.calls, [])

    def test_callback_rechecks_eligibility_after_consent(self):
        f = self.f
        state = f.oauth_start()
        f.settings.google_calendar_pilot_user_ids = ""
        response = f.client.post(f.base + "/calendar/oauth/callback", headers=f.alice,
                                json={"state": state, "code": "synthetic"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(f.fake.calls, [])

    def test_callback_rechecks_eligibility_after_provider_exchange(self):
        f = self.f
        state = f.oauth_start()
        original = f.fake.handle
        def handle(request):
            response = original(request)
            if request.url.path == "/token":
                f.settings.google_calendar_pilot_user_ids = ""
            return response
        f.fake.handle = handle
        # The transport factory resolves the current fake handler at creation.
        response = f.client.post(f.base + "/calendar/oauth/callback", headers=f.alice,
                                json={"state": state, "code": "synthetic"})
        self.assertEqual(response.status_code, 403)
        from sqlalchemy import select
        from backend.app.connector_models import CalendarCredential
        with f.database.session_factory() as session:
            self.assertEqual(session.scalars(select(CalendarCredential)).all(), [])

    def test_nonpilot_admin_cannot_approve_pilot_write(self):
        f = self.f
        _, _, headers, run, _, payload = f.calendar_workflow(approval=True)
        action = f.propose_calendar(headers, run, payload)
        other, _ = f.member("admin")
        self.assertEqual(f.approve(run["id"], action["id"], headers=other).status_code, 403)
        self.assertIsNone(claim_next_agent_action(f.database, f.settings))
        self.assertEqual(f.fake.posts, 0)

    def test_queued_write_rechecks_approver_eligibility(self):
        f = self.f
        _, _, headers, run, _, payload = f.calendar_workflow(approval=True)
        action = f.propose_calendar(headers, run, payload)
        other, other_id = f.member("admin")
        f.settings.google_calendar_pilot_user_ids = f.owner + "," + other_id
        self.assertEqual(f.approve(run["id"], action["id"], headers=other).status_code, 200)
        f.settings.google_calendar_pilot_user_ids = f.owner
        self.assertFalse(f.process(claim_next_agent_action(f.database, f.settings)))
        self.assertEqual(f.fake.posts, 0)

    def test_nonpilot_connection_creator_cannot_be_used_by_allowed_actor(self):
        f = self.f
        connection = f.connection()
        _, other_id = f.member("admin")
        with f.database.session_factory() as session:
            session.get(IntegrationConnection, connection["id"]).created_by_user_id = other_id
            session.commit()
        response = f.client.post(f.base + "/agents", headers=f.alice, json=f.agent_payload(
            allowed_tools=["google_calendar.events.create"], calendar_targets=[
                {"connection_id": connection["id"], "calendar_id": "sandbox@example.com"}]))
        self.assertEqual(response.status_code, 403, response.text)
        self.assertFalse(f.client.get(f.base + "/calendar/provider", headers=f.alice).json()["configured"])

    def test_pilot_cannot_delegate_unapproved_calendar_writes(self):
        f = self.f
        connection = f.connection()
        response = f.client.post(f.base + "/agents", headers=f.alice, json=f.agent_payload(
            require_approval=False, allowed_tools=["google_calendar.events.create"], calendar_targets=[
                {"connection_id": connection["id"], "calendar_id": "sandbox@example.com"}]))
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(f.fake.posts, 0)

    def test_queued_action_rechecks_delegator_eligibility(self):
        f = self.f
        _, agent, headers, run, _, payload = f.calendar_workflow(approval=True)
        action = f.propose_calendar(headers, run, payload)
        self.assertEqual(f.approve(run["id"], action["id"]).status_code, 200)
        _, other_id = f.member("admin")
        with f.database.session_factory() as session:
            session.get(AgentPrincipal, agent["id"]).delegated_by_user_id = other_id
            session.commit()
        self.assertFalse(f.process(claim_next_agent_action(f.database, f.settings)))
        self.assertEqual(f.fake.posts, 0)

    def test_final_insert_fence_rechecks_eligibility_after_initial_read(self):
        f = self.f
        _, _, headers, run, _, payload = f.calendar_workflow(approval=True)
        action = f.propose_calendar(headers, run, payload)
        self.assertEqual(f.approve(run["id"], action["id"]).status_code, 200)
        f.fake.before_first_get = lambda: setattr(f.settings, "google_calendar_pilot_user_ids", "")
        self.assertFalse(f.process(claim_next_agent_action(f.database, f.settings)))
        self.assertEqual(f.fake.posts, 0)

    def test_reconciliation_remains_get_only_after_creator_and_actor_removed(self):
        f = self.f
        _, _, headers, run, _, payload = f.calendar_workflow(approval=True)
        action = f.propose_calendar(headers, run, payload)
        self.assertEqual(f.approve(run["id"], action["id"]).status_code, 200)
        f.fake.unreadable_after_write = True
        self.assertFalse(f.process(claim_next_agent_action(f.database, f.settings)))
        f.settings.google_calendar_pilot_user_ids = ""
        f.fake.unreadable_after_write = False
        response = f.client.post(f.base + f"/agent-runs/{run['id']}/actions/{action['id']}/reconcile", headers=f.alice)
        self.assertEqual(response.status_code, 202, response.text)
        before = len(f.fake.calls)
        self.assertFalse(f.process(claim_next_agent_action(f.database, f.settings)))
        self.assertTrue(all(method == "GET" for method, _ in f.fake.calls[before:]))
        self.assertEqual(f.fake.posts, 1)
        with f.database.session_factory() as session:
            row = session.get(AgentAction, action["id"])
            self.assertEqual(row.error_code, "partial_effect")

    def test_existing_nonpilot_dispatched_action_can_reconcile_when_pilot_is_enabled(self):
        f = self.f
        f.settings.google_calendar_pilot_enabled = False
        _, _, headers, run, _, payload = f.calendar_workflow(approval=False)
        action = f.propose_calendar(headers, run, payload)
        f.fake.unreadable_after_write = True
        self.assertFalse(f.process(claim_next_agent_action(f.database, f.settings)))
        f.settings.google_calendar_pilot_enabled = True
        f.settings.google_calendar_pilot_user_ids = ""
        f.fake.unreadable_after_write = False
        response = f.client.post(f.base + f"/agent-runs/{run['id']}/actions/{action['id']}/reconcile", headers=f.alice)
        self.assertEqual(response.status_code, 202, response.text)
        before = len(f.fake.calls)
        self.assertFalse(f.process(claim_next_agent_action(f.database, f.settings)))
        self.assertTrue(all(method == "GET" for method, _ in f.fake.calls[before:]))
        self.assertEqual(f.fake.posts, 1)

    def test_disconnect_available_for_nonpilot_admin_with_malformed_allowlist(self):
        f = self.f
        connection = f.connection()
        other, _ = f.member("admin")
        f.settings.google_calendar_pilot_user_ids = "invalid"
        response = f.client.post(f.base + f"/calendar/connections/{connection['id']}/disconnect", headers=other, json={})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "revoked")
        self.assertTrue(any(path.endswith("/revoke") for _, path in f.fake.calls))

    def test_nonpilot_mode_retains_existing_qualified_connection_behavior(self):
        f = self.f
        f.settings.google_calendar_pilot_enabled = False
        f.settings.google_calendar_pilot_user_ids = "invalid-but-unused"
        _, _, headers, run, _, payload = f.calendar_workflow(approval=False)
        f.propose_calendar(headers, run, payload)
        self.assertTrue(f.process(claim_next_agent_action(f.database, f.settings)))
        self.assertEqual(f.fake.posts, 1)


class CalendarPilotHostedTests(unittest.TestCase):
    def setUp(self):
        from tests.test_hosted_agents import HostedAgentTests
        self.f = HostedAgentTests(methodName="runTest")
        self.f.setUp()
        self.f.settings.google_calendar_pilot_enabled = True
        self.f.settings.google_calendar_pilot_user_ids = self.f.owner

    def tearDown(self):
        self.f.tearDown()

    def test_allowed_owner_hosted_calendar_and_composite_require_approvals(self):
        self.f.test_calendar_only_and_composite_fixed_receipts_require_all_approvals()

    def test_hosted_runtime_rechecks_creator_eligibility(self):
        f = self.f
        task = f.create(f.calendar_payload())
        f.settings.google_calendar_pilot_user_ids = ""
        f.step()
        self.assertEqual(f.read(task)["status"], "failed")
        self.assertEqual(f.fake.posts, 0)
