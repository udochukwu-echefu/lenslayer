"""Actual durable global gate/transactions/restarts, ONLY fake provider HTTP."""
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import patch

from sqlalchemy import select, func

from backend.app.hosted_agent_models import HostedAgentTask, HostedModelLifetimeBudget, HostedModelReservation
from backend.app.hosted_agent_runtime import claim_next_hosted_task, process_hosted_task
from backend.app.hosted_model_budget import BUDGET_ID, RESERVED_USD
from backend.app.models import Organization, utcnow
from backend.app.database import Database
from tests import test_hosted_agents as fixtures
from tests.test_hosted_model_evaluation import response


class LifetimeBudgetTests(unittest.TestCase):
    def setUp(self):
        self.f = fixtures.HostedAgentTests(methodName="runTest")
        self.f.setUp()
        self.f.budget_patch.stop()  # no mocked authorization: exercise real DeepSeek-only admission
        self.f.enable_model()
        self.f.settings.hosted_model_provider = "deepseek"
        self.f.settings.hosted_model_lifetime_call_limit = 1

    def tearDown(self):
        self.f.tearDown()

    def create_response(self, **overrides):
        return self.f.client.post(self.f.route, headers=self.f.alice, json=self.f.payload(planner_mode="model", **overrides))

    def used(self):
        with self.f.database.session_factory() as session:
            return session.scalar(select(HostedModelLifetimeBudget.reserved_calls).where(HostedModelLifetimeBudget.id == BUDGET_ID)) or 0

    def test_zero_default_and_unpriced_openai_gate_capability_and_creation(self):
        from backend.app.config import Settings
        self.assertEqual(Settings(_env_file=None).hosted_model_lifetime_call_limit, 0)
        for provider, allowance in (("deepseek", 0), ("openai", 1)):
            self.f.settings.hosted_model_provider = provider
            self.f.settings.hosted_model_lifetime_call_limit = allowance
            capabilities = self.f.client.get(self.f.base + "/hosted-agent-capabilities", headers=self.f.alice).json()
            self.assertEqual(capabilities["planner_modes"], ["deterministic"])
            self.assertIsNone(capabilities["model_provider"])
            self.assertEqual(self.create_response().status_code, 503)
        self.assertEqual(self.used(), 0)
        with self.f.database.session_factory() as session:
            self.assertEqual(session.scalar(select(func.count()).select_from(HostedAgentTask)), 0)

    def test_concurrent_cross_organization_admission_uses_one_global_counter(self):
        f = self.f
        routes, payloads = [], []
        for index in range(4):
            org = f.client.post("/api/v1/organizations", headers=f.alice, json={"name": f"Synthetic tenant {index}", "slug": f"synthetic-{index}"}).json()["id"]
            contract, _ = f.seed_contract(org)
            routes.append(f"/api/v1/organizations/{org}/hosted-agent-tasks")
            payloads.append(f.payload(planner_mode="model", contract_id=contract, idempotency_key="same-key-different-tenant"))
        with ThreadPoolExecutor(max_workers=4) as pool:
            statuses = list(pool.map(lambda index: f.client.post(routes[index], headers=f.alice, json=payloads[index]).status_code, range(4)))
        self.assertEqual(sorted(statuses), [201, 503, 503, 503])
        self.assertEqual(self.used(), 1)
        with f.fake_model(response=response()):
            for _ in range(5):
                f.step()
        self.assertEqual(len(f.model_requests), 1)

    def test_concurrent_restarted_workers_dispatch_model_once_for_one_admitted_task(self):
        f = self.f
        task = self.create_response().json()
        f.step(); f.step()  # durable phase=model, no provider call yet
        def worker(_):
            restarted = Database(f.settings)
            try:
                claim = claim_next_hosted_task(restarted, f.settings)
                return process_hosted_task(restarted, f.settings, f.store, *claim) if claim else None
            finally:
                restarted.dispose()
        with f.fake_model(response=response()), ThreadPoolExecutor(max_workers=6) as pool:
            list(pool.map(worker, range(6)))
        self.assertEqual(len(f.model_requests), 1)
        self.assertEqual(self.used(), 1)
        with f.database.session_factory() as session:
            self.assertEqual(session.get(HostedAgentTask, task["id"]).model_calls, 1)

    def test_worker_disable_and_reservation_corruption_stop_before_http_without_refund(self):
        f = self.f
        task = self.create_response().json()
        f.settings.hosted_model_lifetime_call_limit = 0
        with patch("backend.app.hosted_agent_model.decide", side_effect=AssertionError("Disabled allowance cannot call")):
            f.step()
        self.assertEqual(f.read(task)["error_code"], "model_lifetime_budget_unavailable")
        self.assertEqual(self.used(), 1)
        f.settings.hosted_model_lifetime_call_limit = 1
        self.assertEqual(self.create_response(idempotency_key="no-refund-disabled").status_code, 503)

    def test_concurrent_admission_one_total_http_then_stale_disclosure_exhausted(self):
        f = self.f
        with ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(lambda index: self.create_response(idempotency_key=f"concurrent-{index}"), range(6)))
        self.assertEqual(sorted(r.status_code for r in results), [201, 503, 503, 503, 503, 503])
        task = next(r.json() for r in results if r.status_code == 201)
        self.assertEqual(self.used(), 1)
        self.assertEqual(self.create_response(idempotency_key="stale-after-admission").status_code, 503)
        capabilities = f.client.get(f.base + "/hosted-agent-capabilities", headers=f.alice).json()
        self.assertNotIn("model", capabilities["planner_modes"])
        with f.fake_model(response=response()):
            for _ in range(5):
                f.step()
        self.assertEqual(len(f.model_requests), 1)
        self.assertEqual(f.read(task)["status"], "awaiting_approval")
        self.assertIsNone(claim_next_hosted_task(f.database, f.settings))
        with f.database.session_factory() as session:
            ledger = session.get(HostedModelReservation, task["id"])
            row = session.get(HostedAgentTask, task["id"])
            self.assertEqual(ledger.selection_sha256, row.model_selection_sha256)
            self.assertEqual(ledger.reserved_usd, "0.319488")
            self.assertEqual((ledger.input_token_bound, ledger.output_token_bound), (1048576, 4096))

    def test_replay_reserves_once_crash_before_commit_rolls_back_and_restart_consumes_once(self):
        f = self.f
        original = __import__("backend.app.hosted_agent_service", fromlist=["reserve_admission"]).reserve_admission
        def crash(session, settings, task):
            original(session, settings, task)
            raise RuntimeError("synthetic crash before admission commit")
        with patch("backend.app.hosted_agent_service.reserve_admission", crash):
            with self.assertRaises(RuntimeError):
                self.create_response()
        self.assertEqual(self.used(), 0)
        payload = f.payload(planner_mode="model")
        task = f.client.post(f.route, headers=f.alice, json=payload).json()
        self.assertEqual(f.client.post(f.route, headers=f.alice, json=payload).json()["id"], task["id"])
        self.assertEqual(self.used(), 1)
        # Crash after admission commit but before charge: fresh engines must use
        # this existing reservation, not reserve a second call or grant a refund.
        with f.fake_model(response=response()):
            for _ in range(4):
                f.step()
        self.assertEqual(len(f.model_requests), 1)
        self.assertEqual(self.used(), 1)

    def test_charge_commit_crash_unknown_restart_never_posts_again(self):
        f = self.f
        task = self.create_response().json()
        f.step(); f.step()
        with patch("backend.app.hosted_agent_model.decide", side_effect=RuntimeError("crash after durable charged marker")):
            with self.assertRaises(RuntimeError):
                f.step()
        with f.database.session_factory() as session:
            row = session.get(HostedAgentTask, task["id"])
            self.assertEqual(row.model_state, "charged")
            row.lease_expires_at = utcnow() - timedelta(seconds=1)
            session.commit()
        with patch("backend.app.hosted_agent_model.decide", side_effect=AssertionError("No retry after crash")):
            f.step()
        self.assertEqual(f.read(task)["error_code"], "model_outcome_unknown")
        self.assertEqual(self.used(), 1)
        self.assertEqual(self.create_response(idempotency_key="after-crash").status_code, 503)

    def test_cancel_task_org_deletion_and_restart_do_not_replenish_lifetime_counter(self):
        f = self.f
        task = self.create_response().json()
        self.assertEqual(f.client.post(f.route + f"/{task['id']}/cancel", headers=f.alice).status_code, 200)
        self.assertEqual(self.used(), 1)
        with f.database.session_factory() as session:
            session.delete(session.get(HostedAgentTask, task["id"]))
            session.commit()
            self.assertIsNotNone(session.get(HostedModelReservation, task["id"]))
        restarted = Database(f.settings)
        try:
            with restarted.session_factory() as session:
                self.assertEqual(session.get(HostedModelLifetimeBudget, BUDGET_ID).reserved_calls, 1)
                self.assertIsNotNone(session.get(HostedModelReservation, task["id"]))
        finally:
            restarted.dispose()
        self.assertEqual(self.create_response(idempotency_key="after-delete").status_code, 503)
        with f.database.session_factory() as session:
            # DB delete, not the ORM's unrelated workspace relation cascade.
            session.execute(Organization.__table__.delete().where(Organization.id == f.org))
            session.commit()
            self.assertEqual(session.get(HostedModelLifetimeBudget, BUDGET_ID).reserved_calls, 1)
            self.assertIsNotNone(session.get(HostedModelReservation, task["id"]))

    def test_timeout_or_cancel_during_http_retains_reservation_no_second_post(self):
        for outcome in ("timeout", "cancel"):
            if outcome == "cancel":
                self.tearDown(); self.setUp()  # a NEW disposable DB, never reset a spent ledger
            f = self.f
            task = self.create_response().json()
            callback = (lambda: f.client.post(f.route + f"/{task['id']}/cancel", headers=f.alice)) if outcome == "cancel" else None
            with f.fake_model(response=response(), error=outcome == "timeout", callback=callback):
                f.step(); f.step()
                if outcome == "cancel":
                    claim = claim_next_hosted_task(f.database, f.settings)
                    self.assertFalse(process_hosted_task(f.database, f.settings, f.store, *claim))
                else:
                    f.step()
            self.assertEqual(len(f.model_requests), 1)
            self.assertEqual(self.used(), 1)
            self.assertEqual(self.create_response(idempotency_key="after-unknown").status_code, 503)
