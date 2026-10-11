"""Real API/database/drain transitions; only Cloud Tasks and provider HTTP are fake."""
import json
import unittest
from datetime import timedelta
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select

from backend.app import agent_wake, agent_worker_service
from backend.app.agent_models import AgentAction, AgentPrincipal, AgentRun, AgentWorkerHeartbeat
from backend.app.agent_runtime import claim_next_agent_action
from backend.app import agent_runtime
from backend.app.config import Settings
from backend.app.hosted_agent_models import HostedAgentTask
from backend.app.models import utcnow
from backend.app.service_domains.common import aware
from backend.app.worker import run_worker
from tests import test_hosted_agents as fixtures


class OnDemandWorkerTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.HostedAgentTests(methodName="runTest")
        self.fixture.setUp()
        settings = self.settings
        settings.agent_worker_mode = "on_demand"
        settings.agent_worker_url = "https://lenslayer-agent-worker-staging-example.a.run.app"
        settings.agent_worker_queue = "projects/lenslayer/locations/europe-west1/queues/lenslayer-agent-work-staging"
        settings.agent_worker_invoker_email = "lenslayer-staging-wake@lenslayer.iam.gserviceaccount.com"
        self.cloud_tasks = []
        self.cloud_status = 200
        original = agent_wake.enqueue_next_agent_wake
        transport = httpx.MockTransport(self.cloud_request)
        enqueue = lambda database, config, **kwargs: original(database, config, transport=transport, **kwargs)
        self.patches = [patch.object(agent_wake, "enqueue_next_agent_wake", side_effect=enqueue),
                        patch.object(agent_worker_service, "enqueue_next_agent_wake", side_effect=enqueue)]
        for item in self.patches:
            item.start()
        self.worker = TestClient(agent_worker_service.create_worker_application(settings))

    def __getattr__(self, name):
        fixture = self.__dict__.get("fixture")
        if fixture is None:
            raise AttributeError(name)
        return getattr(fixture, name)

    def tearDown(self):
        self.worker.close()
        for item in reversed(self.patches):
            item.stop()
        self.fixture.tearDown()

    def cloud_request(self, request):
        if request.url.host == "metadata.google.internal":
            self.assertEqual(request.headers["Metadata-Flavor"], "Google")
            return httpx.Response(200, json={"access_token": "private-unit-test-access-token"})
        self.assertEqual(request.url.host, "cloudtasks.googleapis.com")
        self.cloud_tasks.append(json.loads(request.content)["task"])
        return httpx.Response(self.cloud_status, json={"private": "must-not-be-logged"})

    def drain(self):
        with patch("backend.app.worker.time.sleep", side_effect=AssertionError("Idle polling is forbidden")):
            response = self.worker.post("/drain")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def next_wake(self):
        with self.database.session_factory() as session:
            return agent_wake.next_agent_wake_at(session)

    def test_empty_queue_has_no_processor_model_or_timer_and_healthy_idle(self):
        with patch("backend.app.worker.run_worker", side_effect=AssertionError("No work must not start the processor")):
            self.assertEqual(self.drain()["status"], "idle")
        self.assertFalse(self.cloud_tasks)
        health = self.client.get("/health/worker")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["state"], "idle")
        self.assertIsNone(health.json()["heartbeat_age_seconds"])

    def test_assignment_wakes_then_sleeps_through_approval_without_spending_attempts(self):
        task = self.fixture.create()
        self.assertTrue(self.cloud_tasks)
        body = self.cloud_tasks[0]
        self.assertEqual(body["httpRequest"]["url"], self.settings.agent_worker_url + "/drain")
        self.assertEqual(body["httpRequest"]["body"], "e30=")
        self.assertEqual(body["httpRequest"]["oidcToken"]["audience"], self.settings.agent_worker_url)
        self.assertNotIn(task["goal"], json.dumps(body))
        self.assertNotIn("private-unit-test-access-token", json.dumps(body))
        self.drain()
        state = self.fixture.read(task)
        self.assertEqual(state["status"], "awaiting_approval")
        self.assertEqual(self.task_count(), 0)
        with self.database.session_factory() as session:
            row = session.get(HostedAgentTask, task["id"])
            self.assertEqual(aware(row.next_attempt_at), aware(row.deadline_at))
            attempts = row.attempts
        self.assertGreater(self.next_wake(), utcnow() + timedelta(minutes=1))
        with patch("backend.app.worker.run_worker", side_effect=AssertionError("Human waits are not runnable work")):
            self.assertEqual(self.drain()["status"], "idle")
        with self.database.session_factory() as session:
            self.assertEqual(session.get(HostedAgentTask, task["id"]).attempts, attempts)

    def test_approval_resumes_exact_task_and_receipt_in_one_drain_without_polling(self):
        task = self.fixture.create()
        self.drain()
        waiting = self.fixture.read(task)
        action = self.fixture.actions(waiting)[0]
        self.assertEqual(self.approve(waiting["run_id"], action["id"]).status_code, 200)
        self.assertLessEqual(self.next_wake(), utcnow())
        self.drain()
        finished = self.fixture.read(task)
        self.assertEqual(finished["status"], "succeeded")
        self.assertEqual(self.task_count(), 1)
        result = self.fixture.actions(finished)[0]
        self.assertEqual(result["id"], action["id"])
        self.assertEqual(result["attempts"], 1)
        self.assertTrue(result["result"]["verified"])
        self.assertIsNone(self.next_wake())
        self.assertEqual(self.drain()["status"], "idle")
        self.assertEqual(self.task_count(), 1)

    def test_model_input_reply_wakes_a_durable_wait_without_another_model_call(self):
        self.fixture.enable_model()
        with self.fixture.fake_model("needs_input"):
            task = self.fixture.create(self.fixture.payload(planner_mode="model"))
            self.drain()
            state = self.fixture.read(task)
            self.assertEqual(state["status"], "awaiting_input")
            inputs = self.client.get(self.base + f"/agent-runs/{state['run_id']}/input-requests", headers=self.alice).json()
            response = self.client.post(self.base + f"/agent-runs/{state['run_id']}/input-requests/{inputs[0]['id']}/supply",
                headers=self.alice, json={"values": {"confirm_plan": True}})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertLessEqual(self.next_wake(), utcnow())
            self.drain()
        self.assertEqual(self.fixture.read(task)["status"], "awaiting_approval")
        self.assertEqual(len(self.fixture.model_requests), 1)

    def test_recovery_reconstructs_a_committed_reply_when_background_wake_is_lost(self):
        self.fixture.enable_model()
        with self.fixture.fake_model("needs_input"):
            task = self.fixture.create(self.fixture.payload(planner_mode="model"))
            self.drain()
        state = self.fixture.read(task)
        inputs = self.client.get(self.base + f"/agent-runs/{state['run_id']}/input-requests", headers=self.alice).json()
        with patch.object(agent_wake, "wake_agent_worker"):
            response = self.client.post(self.base + f"/agent-runs/{state['run_id']}/input-requests/{inputs[0]['id']}/supply",
                headers=self.alice, json={"values": {"confirm_plan": True}})
        self.assertEqual(response.status_code, 200)
        with self.database.session_factory() as session:
            self.assertGreater(aware(session.get(HostedAgentTask, task['id']).next_attempt_at), utcnow())
        self.assertLessEqual(self.next_wake(), utcnow())
        self.assertEqual(self.worker.post("/recover").status_code, 200)
        self.assertEqual(self.fixture.read(task)["status"], "awaiting_approval")
        self.assertEqual(len(self.fixture.model_requests), 1)

    def test_recovery_reconstructs_cancelled_run_without_api_nudge(self):
        task = self.fixture.create()
        self.drain()
        state = self.fixture.read(task)
        with patch.object(agent_wake, "wake_agent_worker"):
            response = self.client.post(self.base + f"/agent-runs/{state['run_id']}/cancel", headers=self.alice)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.worker.post("/recover").status_code, 200)
        self.assertEqual(self.fixture.read(task)["status"], "cancelled")
        self.assertIsNone(self.next_wake())
        self.assertEqual(self.task_count(), 0)

    def test_early_timer_delivery_leaves_a_different_future_timer(self):
        task = self.fixture.create()
        self.drain()
        current = self.cloud_tasks[-1]
        response = self.worker.post("/drain", headers={"X-CloudTasks-TaskName": current["name"].rsplit("/", 1)[-1]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "idle")
        replacement = self.cloud_tasks[-1]
        self.assertNotEqual(replacement["name"], current["name"])
        self.assertGreater(replacement["scheduleTime"], current["scheduleTime"])
        second = self.worker.post("/drain", headers={"X-CloudTasks-TaskName": replacement["name"].rsplit("/", 1)[-1]})
        self.assertEqual(second.status_code, 200)
        self.assertEqual(len({item["name"] for item in (current, replacement, self.cloud_tasks[-1])}), 3)
        self.assertEqual(self.fixture.read(task)["status"], "awaiting_approval")

    def test_long_deadline_timer_stays_within_cloud_tasks_horizon(self):
        task = self.fixture.create()
        self.drain()
        state = self.fixture.read(task)
        far = utcnow() + timedelta(days=365)
        with self.database.session_factory() as session:
            session.get(HostedAgentTask, task["id"]).next_attempt_at = far
            session.get(AgentRun, state["run_id"]).deadline_at = far
            session.get(AgentPrincipal, state["agent_id"]).expires_at = far
            session.get(AgentAction, self.fixture.actions(state)[0]["id"]).approval_expires_at = far
            session.commit()
        before = len(self.cloud_tasks)
        self.assertTrue(agent_wake.enqueue_next_agent_wake(self.database, self.settings))
        self.assertEqual(len(self.cloud_tasks), before)
        near = far - timedelta(days=28)
        with patch.object(agent_wake, 'utcnow', return_value=near):
            self.assertTrue(agent_wake.enqueue_next_agent_wake(self.database, self.settings))
        from datetime import datetime
        scheduled = datetime.fromisoformat(self.cloud_tasks[-1]["scheduleTime"])
        self.assertGreater(scheduled, near + timedelta(days=28))
        self.assertLess(scheduled, near + timedelta(days=30))

    def test_immediate_wake_bursts_share_a_five_second_slot(self):
        self.fixture.create()
        now = utcnow()
        with patch.object(agent_wake, "utcnow", return_value=now):
            for _ in range(3):
                self.assertTrue(agent_wake.enqueue_next_agent_wake(self.database, self.settings))
        self.assertEqual(len({item["name"] for item in self.cloud_tasks[-3:]}), 1)

    def test_expiry_sweep_stops_between_transactions_and_preserves_remaining_work(self):
        tasks = [self.fixture.create(self.fixture.payload(idempotency_key=f"expiry-{i}")) for i in range(3)]
        self.drain()
        with self.database.session_factory() as session:
            for task in tasks:
                row = session.get(HostedAgentTask, task["id"])
                session.get(AgentRun, row.run_id).deadline_at = utcnow() - timedelta(seconds=1)
            session.commit()
        from types import SimpleNamespace
        with patch.object(agent_runtime, "time", SimpleNamespace(monotonic=iter([100, 102]).__next__)):
            self.assertEqual(agent_runtime.expire_agent_runs(self.database, self.settings, self.store, stop_at=101), 1)
        with self.database.session_factory() as session:
            rows = session.scalars(select(AgentRun)).all()
            self.assertEqual(sum(row.status == "failed" for row in rows), 1)
            self.assertEqual(sum(row.status not in agent_wake.TERMINAL for row in rows), 2)
        self.drain()
        self.assertTrue(all(self.fixture.read(task)["status"] == "failed" for task in tasks))
        self.assertIsNone(self.next_wake())

    def test_crash_lease_is_a_future_timer_then_recovers_same_output_once(self):
        task = self.fixture.create()
        self.drain()
        state = self.fixture.read(task)
        action = self.fixture.actions(state)[0]
        self.assertEqual(self.approve(state["run_id"], action["id"]).status_code, 200)
        claim = claim_next_agent_action(self.database, self.settings)
        self.assertEqual(claim[0], action["id"])
        agent_wake.nudge_hosted_tasks(self.database, run_id=state["run_id"])
        # Observe the in-flight claim, then stop instead of repeatedly polling it.
        self.drain()
        with self.database.session_factory() as session:
            row = session.get(AgentAction, action["id"])
            output_id = row.output_id
            expires = aware(row.lease_expires_at)
        self.assertEqual(self.next_wake(), expires)
        self.assertEqual(self.task_count(), 0)
        with self.database.session_factory() as session:
            session.get(AgentAction, action["id"]).lease_expires_at = utcnow() - timedelta(seconds=1)
            session.commit()
        self.drain()
        self.assertEqual(self.fixture.read(task)["status"], "succeeded")
        self.assertEqual(self.task_count(), 1)
        with self.database.session_factory() as session:
            row = session.get(AgentAction, action["id"])
            self.assertEqual(row.output_id, output_id)
            self.assertEqual(row.attempts, 2)

    def test_revocation_resumes_wait_and_cancels_without_an_effect(self):
        task = self.fixture.create()
        self.drain()
        state = self.fixture.read(task)
        response = self.client.post(self.base + f"/agents/{state['agent_id']}/revoke", headers=self.alice)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertLessEqual(self.next_wake(), utcnow())
        self.drain()
        self.assertEqual(self.fixture.read(task)["status"], "cancelled")
        self.assertEqual(self.task_count(), 0)
        self.assertEqual(self.fixture.actions(state)[0]["attempts"], 0)
        self.assertIsNone(self.next_wake())

    def test_scheduled_expiry_closes_a_run_without_an_action_or_continuous_worker(self):
        _, _, run, _, _ = self.workflow()
        with self.database.session_factory() as session:
            row = session.get(AgentRun, run["id"])
            row.deadline_at = utcnow() - timedelta(seconds=1)
            session.commit()
        self.drain()
        response = self.client.get(self.base + f"/agent-runs/{run['id']}", headers=self.alice)
        self.assertEqual(response.json()["error_code"], "deadline_exceeded")
        self.assertEqual(self.task_count(), 0)
        self.assertIsNone(self.next_wake())

    def test_failed_wake_keeps_saved_work_and_recovery_retries_safely(self):
        self.cloud_status = 503
        with self.assertLogs("backend.app.agent_wake", level="ERROR") as logs:
            task = self.fixture.create()
            response = self.worker.post("/recover")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("must-not-be-logged", str(logs.output))
        self.assertNotIn("private-unit-test-access-token", str(logs.output))
        self.assertEqual(self.fixture.read(task)["status"], "awaiting_approval")
        self.cloud_status = 200
        self.assertEqual(self.worker.post("/recover").status_code, 200)
        self.assertEqual(self.task_count(), 0)
        self.assertGreater(self.next_wake(), utcnow())

    def test_document_lane_exits_empty_without_model_or_agent_claims(self):
        task = self.fixture.create()
        with patch("backend.app.worker.claim_next_hosted_task", side_effect=AssertionError("Wrong lane")), \
             patch("backend.app.worker.claim_next_agent_action", side_effect=AssertionError("Wrong lane")), \
             patch("backend.app.worker.time.sleep", side_effect=AssertionError("Idle polling")):
            run_worker(self.settings, documents_only=True,
                review_workflow_factory=lambda: self.fail("Empty queue must not initialize document models"))
        self.assertEqual(self.fixture.read(task)["status"], "queued")
        with self.database.session_factory() as session:
            self.assertEqual(session.scalar(select(AgentWorkerHeartbeat.lane)), "documents")

    def test_overdue_work_is_unhealthy_but_long_human_wait_is_healthy(self):
        task = self.fixture.create()
        with self.database.session_factory() as session:
            session.get(HostedAgentTask, task["id"]).next_attempt_at = utcnow() - timedelta(hours=2)
            session.commit()
        self.assertEqual(self.client.get("/health/worker").status_code, 503)
        self.drain()
        self.assertEqual(self.client.get("/health/worker").status_code, 200)

    def test_bounded_drain_returns_with_work_preserved_for_the_next_wake(self):
        task = self.fixture.create()
        run_worker(self.settings, agents_only=True, max_drain_seconds=0)
        state = self.fixture.read(task)
        self.assertEqual(state["phase"], "initialize")
        self.assertLessEqual(self.next_wake(), utcnow())
        self.drain()
        self.assertEqual(self.fixture.read(task)["status"], "awaiting_approval")

    def test_queue_duplicate_is_a_successful_unchanged_future_timer(self):
        self.cloud_status = 409
        task = self.fixture.create()
        self.drain()
        self.assertEqual(self.fixture.read(task)["status"], "awaiting_approval")
        self.assertEqual(self.worker.post("/recover").status_code, 200)


class WorkerConfigurationTests(unittest.TestCase):
    def test_on_demand_wake_destinations_require_project_scoped_https_cloud_run(self):
        values = dict(agent_worker_mode="on_demand", agent_worker_url="https://worker-example.a.run.app",
            agent_worker_queue="projects/lenslayer/locations/europe-west1/queues/agents",
            agent_worker_invoker_email="worker-wake@lenslayer.iam.gserviceaccount.com")
        self.assertEqual(Settings(_env_file=None, **values).agent_worker_mode, "on_demand")
        for change in ({"agent_worker_url": "https://worker-example.a.run.app/?token=bad"},
                       {"agent_worker_url": "https://user:password@worker-example.a.run.app"},
                       {"agent_worker_url": "https://example.com"}, {"agent_worker_queue": "projects/other/locations/region/queues/a"},
                       {"agent_worker_invoker_email": "wake@other.iam.gserviceaccount.com"},
                       {"agent_worker_mode": "sleep"}):
            with self.subTest(change=change), self.assertRaises(ValidationError):
                Settings(_env_file=None, **{**values, **change})


if __name__ == "__main__":
    unittest.main()
