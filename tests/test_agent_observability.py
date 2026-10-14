import contextlib
from datetime import timedelta
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import tempfile

from fastapi.testclient import TestClient
from sqlalchemy import text

from backend.app.agent_models import AgentAction, AgentRunEvent
from backend.app.agent_observability import observe_agent_worker
from backend.app.agent_wake import enqueue_next_agent_wake
from backend.app.config import Settings
from backend.app.connector_models import CalendarCredential
from backend.app.database import Database
from backend.app.models import utcnow


class WorkerObservationTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(_env_file=None, database_url="sqlite://", worker_health_max_age_seconds=300)
        self.db = Database(self.settings)
        self.db.create_schema()

    def tearDown(self):
        self.db.dispose()

    def observe(self, database=None):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = observe_agent_worker(database or self.db, self.settings)
        self.assertEqual(json.loads(output.getvalue()), result)
        return result, output.getvalue()

    def test_empty_ledger_is_healthy_without_fake_heartbeat(self):
        result, _ = self.observe()
        self.assertEqual(result["state"], "healthy")
        self.assertEqual(result["overdue_wake_seconds"], 0)
        self.assertEqual(result["unknown_action_outcomes"], 0)

    def test_uncertainty_and_revocation_alert_without_private_labels(self):
        with self.db.session_factory() as session:
            session.add(AgentAction(run_id="private-run", idempotency_key="private-goal",
                tool="calendar.events.create", input_json="private source text", input_sha256="0"*64,
                status="unknown_outcome"))
            session.add(CalendarCredential(connection_id="private-connection", organization_id="private-tenant",
                encrypted_json="private-secret", scopes_json="[]", calendar_ids_json="[]", revoke_pending=True))
            session.commit()
        result, output = self.observe()
        self.assertEqual(result["state"], "attention")
        self.assertEqual(result["unknown_action_outcomes"], 1)
        self.assertEqual(result["pending_provider_revocations"], 1)
        self.assertNotIn("private", output)

    def test_recent_partial_effects_are_observed_but_old_history_is_not_realerted(self):
        with self.db.session_factory() as session:
            session.add_all([AgentRunEvent(run_id="private-run", sequence=1, type="action.partial_effect"),
                AgentRunEvent(run_id="private-run", sequence=2, type="action.partial_effect",
                              created_at=utcnow()-timedelta(hours=3))])
            session.commit()
        result, output = self.observe()
        self.assertEqual(result["recent_partial_effects"], 1)
        self.assertEqual(result["state"], "attention")
        self.assertNotIn("private", output)

    def test_observation_failure_does_not_log_exception_contents(self):
        def unavailable():
            raise RuntimeError("secret provider body and credential")
        result, output = self.observe(SimpleNamespace(session_factory=unavailable))
        self.assertEqual(result["state"], "unavailable")
        self.assertNotIn("secret", output)

    def test_expired_running_lease_needs_attention_after_worker_drain(self):
        with self.db.session_factory() as session:
            session.add(AgentAction(run_id="private-run", idempotency_key="private-goal",
                tool="workspace.tasks.create", input_json="private-source", input_sha256="0"*64,
                status="running", lease_expires_at=utcnow()-timedelta(seconds=1)))
            session.commit()
        result, output = self.observe()
        self.assertEqual(result["state"], "attention")
        self.assertEqual(result["expired_action_leases"], 1)
        self.assertNotIn("private", output)

    def test_lost_enqueue_emits_only_fixed_metadata_before_hourly_recovery(self):
        database = SimpleNamespace(session_factory=lambda: (_ for _ in ()).throw(
            RuntimeError("private provider body and bearer")))
        output = io.StringIO()
        with contextlib.redirect_stdout(output), patch("backend.app.agent_wake.logger.error"):
            self.assertFalse(enqueue_next_agent_wake(database, SimpleNamespace(agent_worker_mode="on_demand")))
        self.assertEqual(json.loads(output.getvalue()), {
            "kind": "lenslayer_agent_wake_failure", "severity": "ERROR"})
        self.assertNotIn("private", output.getvalue())


class MonitoringPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("agent_monitoring", Path(__file__).resolve().parents[1] / "scripts/prepare-agent-monitoring.py")
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def test_unrouted_policies_are_disabled_and_future_queue_depth_is_not_an_incident(self):
        policies = self.module.policies()
        self.assertEqual(len(policies), 5)
        for policy in policies.values():
            self.assertFalse(policy["enabled"])
            self.assertFalse(policy["notificationChannels"])
        serialized = json.dumps(policies)
        self.assertNotIn("queue/depth", serialized)
        self.assertNotIn("oldest_task_age", serialized)
        self.assertIn("lenslayer_agent_wake_failure", serialized)

    def test_cross_project_channels_rejected_and_staging_filters_are_isolated(self):
        with self.assertRaises(ValueError):
            self.module.policies(channels=["projects/other/notificationChannels/1"])
        policies = self.module.policies(stage=True, channels=["projects/lenslayer/notificationChannels/1"])
        for policy in policies.values():
            self.assertTrue(policy["enabled"])
            self.assertEqual(policy["userLabels"]["environment"], "staging")
            self.assertIn("-staging", json.dumps(policy["conditions"]))


class MigrationReadinessTests(unittest.TestCase):
    def test_old_schema_cannot_report_ready_for_new_context_routes(self):
        from backend.app.application import create_app
        with tempfile.TemporaryDirectory() as directory:
            settings = Settings(_env_file=None, environment="test", database_url=f"sqlite:///{directory}/db.sqlite",
                                object_storage_root=Path(directory)/"files")
            app = create_app(settings)
            with TestClient(app) as client:
                self.assertEqual(client.get("/health/ready").status_code, 200)
                with app.state.database.engine.begin() as connection:
                    connection.execute(text("DROP TABLE agent_context_records"))
                response = client.get("/health/ready")
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json()["detail"], "Database is unavailable.")


if __name__ == "__main__":
    unittest.main()
