import copy
import os
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import func, select

from backend.app.agent_models import AgentAction, AgentEvidence, AgentPrincipal, AgentRun
from backend.app.agent_runtime import claim_next_agent_action, expire_agent_runs, process_agent_action
from backend.app.config import Settings
from backend.app.database import Base, Database
from backend.app.document_intelligence import build_review_workflow
from backend.app.main import create_app
from backend.app.models import Contract, ContractVersion, Membership, WorkflowTask, utcnow
from backend.app.worker import run_worker


class AgentInfrastructureTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        root = Path(self.tempdir.name)
        self.settings = Settings(_env_file=None, environment="test", database_url=f"sqlite:///{root / 'agents.db'}",
                                 object_storage_root=root / "objects", auto_create_schema=True, auth_mode="local")
        self.app = create_app(self.settings)
        self.context = TestClient(self.app)
        self.client = self.context.__enter__()
        self.alice = {"X-LensLayer-User": "alice", "X-LensLayer-Email": "alice@example.com"}
        response = self.client.post("/api/v1/organizations", headers=self.alice, json={"name": "Agent Workspace", "slug": "agents"})
        self.assertEqual(response.status_code, 201, response.text)
        self.org = response.json()["id"]
        self.owner = self.client.get("/api/v1/me", headers=self.alice).json()["id"]
        self.base = f"/api/v1/organizations/{self.org}"
        self.database = self.app.state.database
        self.store = self.app.state.object_store
        self.source = "Agreement 📄\nThis agreement renews on 2026-12-31. Give renewal notice at least 30 days before renewal."
        self.contract, self.version = self.seed_contract(self.org)
        self.due = "2026-12-01T09:00:00Z"

    def tearDown(self):
        self.context.__exit__(None, None, None)
        self.tempdir.cleanup()

    def seed_contract(self, organization_id, *, retain_source=True):
        with self.database.session_factory() as session:
            contract = Contract(organization_id=organization_id, created_by_user_id=self.owner, title="Supplier agreement",
                                source_name="supplier.txt", status="ready", retain_source_text=retain_source,
                                expires_at=utcnow() + timedelta(days=30))
            session.add(contract)
            session.flush()
            version = ContractVersion(organization_id=organization_id, contract_id=contract.id, version_number=1,
                                      source_name="supplier.txt", sha256="0" * 64, size_bytes=100,
                                      extracted_text=self.source if retain_source else None)
            session.add(version)
            session.commit()
            return contract.id, version.id

    def member(self, role="viewer"):
        headers = {"X-LensLayer-User": "bob", "X-LensLayer-Email": "bob@example.com"}
        user_id = self.client.get("/api/v1/me", headers=headers).json()["id"]
        with self.database.session_factory() as session:
            session.add(Membership(organization_id=self.org, user_id=user_id, role=role))
            session.commit()
        return headers, user_id

    def agent_payload(self, **overrides):
        return {"name": "Renewal agent", "allowed_tools": ["documents.retrieve", "workspace.tasks.create"],
                "contract_ids": [self.contract], "assignee_ids": [self.owner], "require_approval": True,
                "expires_at": (utcnow() + timedelta(days=7)).isoformat(), "max_actions_per_run": 1, **overrides}

    def agent(self, **overrides):
        response = self.client.post(self.base + "/agents", headers=self.alice, json=self.agent_payload(**overrides))
        self.assertEqual(response.status_code, 201, response.text)
        payload = response.json()
        return payload["agent"], {"Authorization": f"Bearer {payload['token']}"}

    def run_payload(self, **overrides):
        return {"idempotency_key": "renewal-001", "goal": "Create the renewal follow-up task",
                "contract_ids": [self.contract], "allowed_tools": ["documents.retrieve", "workspace.tasks.create"],
                "max_actions": 1, "deadline_at": (utcnow() + timedelta(days=1)).isoformat(),
                "success_condition": {"type": "workspace_task_created", "contract_id": self.contract,
                                      "assigned_to_user_id": self.owner, "due_at": self.due}, **overrides}

    def create_run(self, headers, **overrides):
        response = self.client.post("/api/v1/agent/runs", headers=headers, json=self.run_payload(**overrides))
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def evidence(self, headers, run_id):
        response = self.client.post(f"/api/v1/agent/runs/{run_id}/evidence", headers=headers,
                                    json={"contract_id": self.contract, "query": "renewal notice"})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def action_payload(self, evidence_id, **input_overrides):
        return {"idempotency_key": "task-001", "tool": "workspace.tasks.create", "input": {
            "contract_id": self.contract, "assigned_to_user_id": self.owner,
            "title": "Confirm renewal decision", "description": "Review the notice deadline.",
            "due_at": self.due, "evidence_id": evidence_id,
            "deadline_basis": {"renewal_date": "2026-12-31", "notice_days": 30}, **input_overrides}}

    def action(self, headers, run_id, evidence_id):
        response = self.client.post(f"/api/v1/agent/runs/{run_id}/actions", headers=headers,
                                    json=self.action_payload(evidence_id))
        self.assertEqual(response.status_code, 202, response.text)
        return response.json()

    def workflow(self, approval=True):
        agent, headers = self.agent(require_approval=approval)
        run = self.create_run(headers)
        evidence = self.evidence(headers, run["id"])
        action = self.action(headers, run["id"], evidence["id"])
        return agent, headers, run, evidence, action

    def approve(self, run_id, action_id, decision="approved", headers=None):
        return self.client.post(f"{self.base}/agent-runs/{run_id}/actions/{action_id}/approval",
                                headers=headers or self.alice, json={"decision": decision, "reason": "Checked source and task scope."})

    def task_count(self):
        with self.database.session_factory() as session:
            return session.scalar(select(func.count()).select_from(WorkflowTask))

    def process(self, claim):
        return process_agent_action(self.database, self.settings, self.store, *claim)

    def test_first_workflow_executes_and_verifies_only_after_human_approval(self):
        agent, headers, run, evidence, action = self.workflow()
        self.assertEqual(action["status"], "awaiting_approval")
        self.assertIsNone(claim_next_agent_action(self.database, self.settings))
        self.assertEqual(self.task_count(), 0)
        approval = self.approve(run["id"], action["id"])
        self.assertEqual(approval.status_code, 200, approval.text)
        self.assertEqual(approval.json()["status"], "queued")
        run_worker(self.settings, once=True)
        completed = self.client.get(f"/api/v1/agent/runs/{run['id']}", headers=headers).json()
        self.assertEqual(completed["status"], "succeeded")
        self.assertTrue(completed["result"]["verified"])
        self.assertEqual(completed["result"]["verification_method"], "database_read_back")
        task = self.client.get(self.base + "/tasks", headers=self.alice).json()[0]
        self.assertEqual(task["assigned_to_user_id"], self.owner)
        self.assertEqual(task["source_reference"]["evidence_id"], evidence["id"])
        self.assertEqual(task["source_reference"]["agent_id"], agent["id"])
        self.assertEqual(task["source_reference"]["deadline_basis_origin"], "caller_supplied")
        events = self.client.get(f"/api/v1/agent/runs/{run['id']}/events", headers=headers).json()
        self.assertEqual([item["sequence"] for item in events], list(range(1, len(events) + 1)))
        self.assertEqual(events[-1]["type"], "run.succeeded")
        self.assertNotIn("excerpt", str(events))

    def test_one_time_credential_is_hashed_and_cannot_administer_workspace(self):
        agent, headers = self.agent()
        listed = self.client.get(self.base + "/agents", headers=self.alice).json()
        self.assertNotIn("token", listed[0])
        self.assertNotIn("token_hash", listed[0])
        with self.database.session_factory() as session:
            principal = session.get(AgentPrincipal, agent["id"])
            self.assertNotIn(principal.token_hash, headers["Authorization"])
        self.assertEqual(self.client.get(self.base + "/agents", headers=headers).status_code, 401)
        self.assertEqual(self.client.get("/api/v1/agent/tools", headers=self.alice).status_code, 401)
        response = self.client.get("/api/v1/agent/tools", headers={"Authorization": "Bearer ll_agent_wrong"})
        self.assertEqual(response.status_code, 401)

    def test_viewer_can_inspect_run_but_cannot_delegate_cancel_or_approve(self):
        _, _, run, _, action = self.workflow()
        viewer, _ = self.member()
        self.assertEqual(self.client.get(f"{self.base}/agent-runs/{run['id']}", headers=viewer).status_code, 200)
        self.assertEqual(self.client.post(self.base + "/agents", headers=viewer, json=self.agent_payload()).status_code, 403)
        self.assertEqual(self.client.post(f"{self.base}/agent-runs/{run['id']}/cancel", headers=viewer).status_code, 403)
        self.assertEqual(self.approve(run["id"], action["id"], headers=viewer).status_code, 403)

    def test_cross_organization_and_cross_agent_access_is_denied(self):
        _, headers, run, evidence, _ = self.workflow()
        outsider = {"X-LensLayer-User": "outsider"}
        other_org = self.client.post("/api/v1/organizations", headers=outsider,
                                     json={"name": "Other", "slug": "other"}).json()["id"]
        foreign_contract, _ = self.seed_contract(other_org)
        self.assertEqual(self.client.post(self.base + "/agents", headers=self.alice,
                                          json=self.agent_payload(contract_ids=[foreign_contract])).status_code, 404)
        for suffix in ("", "/events", "/actions", f"/evidence/{evidence['id']}"):
            self.assertEqual(self.client.get(f"/api/v1/organizations/{other_org}/agent-runs/{run['id']}{suffix}", headers=outsider).status_code, 404)
        _, other_headers = self.agent()
        self.assertEqual(self.client.get(f"/api/v1/agent/runs/{run['id']}", headers=other_headers).status_code, 404)
        scoped = self.client.post(f"/api/v1/agent/runs/{run['id']}/evidence", headers=headers,
                                  json={"contract_id": foreign_contract, "query": "renewal"})
        self.assertEqual(scoped.status_code, 403)

    def test_agent_expiry_and_scope_limits_are_enforced(self):
        self.assertEqual(self.client.post(self.base + "/agents", headers=self.alice,
                                          json=self.agent_payload(expires_at=(utcnow() - timedelta(seconds=1)).isoformat())).status_code, 422)
        _, headers = self.agent()
        for overrides, expected in (({"max_actions": 2}, 403),
                                    ({"contract_ids": ["not-delegated"]}, 403),
                                    ({"allowed_tools": ["documents.retrieve"]}, 422),
                                    ({"deadline_at": (utcnow() + timedelta(days=8)).isoformat()}, 422)):
            response = self.client.post("/api/v1/agent/runs", headers=headers, json=self.run_payload(**overrides))
            self.assertEqual(response.status_code, expected, response.text)
        tools = self.client.get("/api/v1/agent/tools", headers=headers).json()
        self.assertEqual({tool["name"] for tool in tools}, {"documents.retrieve", "workspace.tasks.create"})

    def test_run_and_action_replays_are_idempotent_and_conflicting_input_is_rejected(self):
        _, headers = self.agent(require_approval=False)
        payload = self.run_payload()
        run = self.client.post("/api/v1/agent/runs", headers=headers, json=payload).json()
        replay = self.client.post("/api/v1/agent/runs", headers=headers, json=payload)
        self.assertEqual(replay.json()["id"], run["id"])
        changed = {**payload, "goal": "Different goal"}
        self.assertEqual(self.client.post("/api/v1/agent/runs", headers=headers, json=changed).status_code, 409)
        evidence = self.evidence(headers, run["id"])
        action_payload = self.action_payload(evidence["id"])
        url = f"/api/v1/agent/runs/{run['id']}/actions"
        action = self.client.post(url, headers=headers, json=action_payload).json()
        self.assertEqual(self.client.post(url, headers=headers, json=action_payload).json()["id"], action["id"])
        run_worker(self.settings, once=True)
        self.assertEqual(self.client.post(url, headers=headers, json=action_payload).json()["id"], action["id"])
        changed_action = copy.deepcopy(action_payload)
        changed_action["input"]["title"] = "A different action"
        self.assertEqual(self.client.post(url, headers=headers, json=changed_action).status_code, 409)
        self.assertEqual(self.task_count(), 1)

    def test_concurrent_action_replay_dispatches_one_task(self):
        _, headers = self.agent(require_approval=False)
        run = self.create_run(headers)
        evidence = self.evidence(headers, run["id"])
        payload = self.action_payload(evidence["id"])
        url = f"/api/v1/agent/runs/{run['id']}/actions"
        with ThreadPoolExecutor(max_workers=4) as pool:
            responses = list(pool.map(lambda _: self.client.post(url, headers=headers, json=payload), range(4)))
        self.assertTrue(all(item.status_code == 202 for item in responses), [item.text for item in responses])
        self.assertEqual(len({item.json()["id"] for item in responses}), 1)
        with ThreadPoolExecutor(max_workers=4) as pool:
            claims = list(pool.map(lambda _: claim_next_agent_action(self.database, self.settings), range(4)))
        winners = [claim for claim in claims if claim]
        self.assertEqual(len(winners), 1)
        self.assertTrue(self.process(winners[0]))
        self.assertEqual(self.task_count(), 1)

    def test_action_budget_and_exact_success_condition(self):
        _, headers, run, evidence, _ = self.workflow(False)
        payload = self.action_payload(evidence["id"])
        payload["idempotency_key"] = "another-task"
        self.assertEqual(self.client.post(f"/api/v1/agent/runs/{run['id']}/actions", headers=headers, json=payload).status_code, 409)
        second_run = self.create_run(headers, idempotency_key="other-run")
        second_evidence = self.evidence(headers, second_run["id"])
        wrong_due = self.action_payload(second_evidence["id"], due_at="2026-12-02T09:00:00Z")
        self.assertEqual(self.client.post(f"/api/v1/agent/runs/{second_run['id']}/actions", headers=headers, json=wrong_due).status_code, 422)
        wrong_assignee = self.action_payload(second_evidence["id"], assigned_to_user_id="outsider")
        self.assertEqual(self.client.post(f"/api/v1/agent/runs/{second_run['id']}/actions", headers=headers, json=wrong_assignee).status_code, 403)
        wrong_evidence = self.action_payload(evidence["id"])
        self.assertEqual(self.client.post(f"/api/v1/agent/runs/{second_run['id']}/actions", headers=headers, json=wrong_evidence).status_code, 422)

    def test_evidence_offsets_provenance_and_read_back_respect_retention(self):
        _, headers, run, evidence, _ = self.workflow(False)
        self.assertEqual(evidence["excerpt"], self.source[evidence["start_offset"]:evidence["end_offset"]])
        self.assertEqual(evidence["version_id"], self.version)
        self.assertEqual(len(evidence["source_sha256"]), 64)
        read = self.client.get(f"{self.base}/agent-runs/{run['id']}/evidence/{evidence['id']}", headers=self.alice)
        self.assertEqual(read.json()["excerpt"], evidence["excerpt"])
        with self.database.session_factory() as session:
            receipt = session.get(AgentEvidence, evidence["id"])
            self.assertFalse(hasattr(receipt, "excerpt"))
            session.get(Contract, self.contract).retain_source_text = False
            session.commit()
        read = self.client.get(f"/api/v1/agent/runs/{run['id']}/evidence/{evidence['id']}", headers=headers)
        self.assertEqual(read.status_code, 409)
        self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
        self.assertEqual(self.task_count(), 0)

    def test_unknown_query_and_unretained_text_cannot_produce_evidence(self):
        _, headers = self.agent()
        run = self.create_run(headers)
        url = f"/api/v1/agent/runs/{run['id']}/evidence"
        self.assertEqual(self.client.post(url, headers=headers, json={"contract_id": self.contract, "query": "absent phrase"}).status_code, 404)
        with self.database.session_factory() as session:
            session.get(ContractVersion, self.version).extracted_text = None
            session.commit()
        self.assertEqual(self.client.post(url, headers=headers, json={"contract_id": self.contract, "query": "renewal"}).status_code, 409)

    def test_new_document_version_invalidates_previously_approved_evidence(self):
        _, _, run, _, action = self.workflow()
        self.assertEqual(self.approve(run["id"], action["id"]).status_code, 200)
        with self.database.session_factory() as session:
            session.add(ContractVersion(organization_id=self.org, contract_id=self.contract, version_number=2,
                                        source_name="revised.txt", sha256="1" * 64, size_bytes=100, extracted_text="Revised renewal terms."))
            session.commit()
        self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
        self.assertEqual(self.task_count(), 0)
        status = self.client.get(f"{self.base}/agent-runs/{run['id']}", headers=self.alice).json()
        self.assertEqual(status["status"], "failed")

    def test_revocation_and_cancellation_prevent_claimed_work(self):
        for operation in ("revoke", "cancel"):
            with self.subTest(operation=operation):
                agent, headers = self.agent(require_approval=False)
                run = self.create_run(headers, idempotency_key=operation)
                evidence = self.evidence(headers, run["id"])
                self.action(headers, run["id"], evidence["id"])
                claim = claim_next_agent_action(self.database, self.settings)
                if operation == "revoke":
                    response = self.client.post(f"{self.base}/agents/{agent['id']}/revoke", headers=self.alice)
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(self.client.get("/api/v1/agent/tools", headers=headers).status_code, 401)
                else:
                    response = self.client.post(f"/api/v1/agent/runs/{run['id']}/cancel", headers=headers)
                    self.assertEqual(response.json()["status"], "cancelled")
                self.assertFalse(self.process(claim))
                self.assertEqual(self.task_count(), 0)

    def test_worker_crash_before_commit_rolls_back_task_and_recovers_once(self):
        _, _, run, _, action = self.workflow(False)
        first = claim_next_agent_action(self.database, self.settings)
        from backend.app.services import PlatformService
        original = PlatformService._event

        def simulate_crash(service, run_record, event_type, data=None):
            if event_type == "action.succeeded":
                raise RuntimeError("Simulated worker crash after task creation")
            return original(service, run_record, event_type, data)

        with patch.object(PlatformService, "_event", simulate_crash):
            with self.assertRaises(RuntimeError):
                self.process(first)
        self.assertEqual(self.task_count(), 0)
        with self.database.session_factory() as session:
            row = session.get(AgentAction, action["id"])
            self.assertEqual(row.status, "running")
            row.lease_expires_at = utcnow() - timedelta(seconds=1)
            session.commit()
        recovered = claim_next_agent_action(self.database, self.settings)
        self.assertNotEqual(first[1], recovered[1])
        self.assertFalse(self.process(first))
        self.assertTrue(self.process(recovered))
        self.assertFalse(self.process(recovered))
        self.assertEqual(self.task_count(), 1)

    def test_expired_or_reclaimed_lease_cannot_commit(self):
        _, _, _, _, action = self.workflow(False)
        first = claim_next_agent_action(self.database, self.settings)
        with self.database.session_factory() as session:
            session.get(AgentAction, action["id"]).lease_expires_at = utcnow() - timedelta(seconds=1)
            session.commit()
        self.assertFalse(self.process(first))
        second = claim_next_agent_action(self.database, self.settings)
        self.assertFalse(self.process(first))
        self.assertTrue(self.process(second))
        self.assertEqual(self.task_count(), 1)

    def test_approval_cannot_be_self_granted_rejected_or_modified(self):
        _, headers, run, evidence, action = self.workflow()
        self.assertEqual(self.approve(run["id"], action["id"], headers=headers).status_code, 401)
        mutated = self.action_payload(evidence["id"], title="Changed title")
        self.assertEqual(self.client.post(f"/api/v1/agent/runs/{run['id']}/actions", headers=headers, json=mutated).status_code, 409)
        self.assertEqual(self.approve(run["id"], action["id"], decision="rejected").status_code, 200)
        self.assertIsNone(claim_next_agent_action(self.database, self.settings))
        final = self.client.get(f"/api/v1/agent/runs/{run['id']}", headers=headers).json()
        self.assertEqual(final["error_code"], "approval_rejected")

    def test_expired_approval_abandoned_run_and_demoted_delegator_are_closed(self):
        _, _, run, _, action = self.workflow()
        with self.database.session_factory() as session:
            session.get(AgentAction, action["id"]).approval_expires_at = utcnow() - timedelta(seconds=1)
            session.commit()
        self.assertEqual(self.approve(run["id"], action["id"]).status_code, 409)
        self.assertEqual(expire_agent_runs(self.database, self.settings, self.store), 1)
        self.assertEqual(self.client.get(f"{self.base}/agent-runs/{run['id']}", headers=self.alice).json()["error_code"], "approval_expired")
        _, headers = self.agent()
        abandoned = self.create_run(headers, idempotency_key="abandoned")
        with self.database.session_factory() as session:
            session.get(AgentRun, abandoned["id"]).deadline_at = utcnow() - timedelta(seconds=1)
            session.commit()
        self.assertEqual(expire_agent_runs(self.database, self.settings, self.store), 1)
        fresh = self.create_run(headers, idempotency_key="demoted")
        with self.database.session_factory() as session:
            membership = session.scalar(select(Membership).where(Membership.organization_id == self.org, Membership.user_id == self.owner))
            membership.role = "viewer"
            session.commit()
        self.assertEqual(self.client.get("/api/v1/agent/tools", headers=headers).status_code, 403)
        self.assertEqual(expire_agent_runs(self.database, self.settings, self.store), 1)
        with self.database.session_factory() as session:
            self.assertEqual(session.get(AgentRun, fresh["id"]).error_code, "agent_inactive")

    def test_input_binding_and_retry_limit_stop_dispatch(self):
        for mutation in ("binding", "retries"):
            with self.subTest(mutation=mutation):
                _, headers = self.agent(require_approval=False)
                run = self.create_run(headers, idempotency_key=mutation)
                evidence = self.evidence(headers, run["id"])
                action = self.action(headers, run["id"], evidence["id"])
                with self.database.session_factory() as session:
                    row = session.get(AgentAction, action["id"])
                    if mutation == "binding":
                        row.input_sha256 = "0" * 64
                    else:
                        row.attempts = self.settings.agent_action_max_attempts
                    session.commit()
                self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
                self.assertEqual(self.task_count(), 0)

    def test_date_arithmetic_and_strict_inputs(self):
        _, headers = self.agent()
        run = self.create_run(headers)
        evidence = self.evidence(headers, run["id"])
        wrong_basis = self.action_payload(evidence["id"], deadline_basis={"renewal_date": "2026-12-31", "notice_days": 29})
        self.assertEqual(self.client.post(f"/api/v1/agent/runs/{run['id']}/actions", headers=headers, json=wrong_basis).status_code, 422)
        extra = self.action_payload(evidence["id"])
        extra["input"]["execute_as_admin"] = True
        self.assertEqual(self.client.post(f"/api/v1/agent/runs/{run['id']}/actions", headers=headers, json=extra).status_code, 422)
        naive = self.run_payload(idempotency_key="naive")
        naive["success_condition"]["due_at"] = "2026-12-01T09:00:00"
        self.assertEqual(self.client.post("/api/v1/agent/runs", headers=headers, json=naive).status_code, 422)
        duplicated = self.agent_payload(contract_ids=[self.contract, self.contract])
        self.assertEqual(self.client.post(self.base + "/agents", headers=self.alice, json=duplicated).status_code, 422)

    def test_event_pagination_and_invalid_limits(self):
        _, headers, run, _, _ = self.workflow(False)
        url = f"/api/v1/agent/runs/{run['id']}/events"
        first = self.client.get(url + "?limit=1", headers=headers).json()
        rest = self.client.get(url + "?after_sequence=1", headers=headers).json()
        self.assertEqual(first[0]["sequence"], 1)
        self.assertTrue(all(item["sequence"] > 1 for item in rest))
        self.assertEqual(self.client.get(url + "?after_sequence=-1", headers=headers).status_code, 422)
        self.assertEqual(self.client.get("/api/v1/agent/runs?limit=1000", headers=headers).status_code, 422)

    def test_retrieval_receipt_budget_and_timezone_normalization(self):
        self.settings.agent_max_evidence_receipts_per_run = 1
        _, headers = self.agent(require_approval=False)
        payload = self.run_payload()
        payload["success_condition"]["due_at"] = "2026-12-01T10:00:00+01:00"
        response = self.client.post("/api/v1/agent/runs", headers=headers, json=payload)
        self.assertEqual(response.status_code, 201, response.text)
        run = response.json()
        self.assertEqual(run["success_condition"]["due_at"], "2026-12-01T09:00:00Z")
        evidence = self.evidence(headers, run["id"])
        second = self.client.post(f"/api/v1/agent/runs/{run['id']}/evidence", headers=headers,
                                   json={"contract_id": self.contract, "query": "renewal"})
        self.assertEqual(second.status_code, 409)
        self.action(headers, run["id"], evidence["id"])
        self.assertTrue(self.process(claim_next_agent_action(self.database, self.settings)))
        self.assertEqual(self.task_count(), 1)

    def test_approval_hash_and_removed_approver_are_rechecked_at_dispatch(self):
        admin, admin_id = self.member("admin")
        for mutation in ("binding", "removed_approver"):
            with self.subTest(mutation=mutation):
                _, headers = self.agent()
                run = self.create_run(headers, idempotency_key=mutation)
                evidence = self.evidence(headers, run["id"])
                action = self.action(headers, run["id"], evidence["id"])
                self.assertEqual(self.approve(run["id"], action["id"], headers=admin).status_code, 200)
                with self.database.session_factory() as session:
                    if mutation == "binding":
                        session.get(AgentAction, action["id"]).approved_input_sha256 = "0" * 64
                    else:
                        membership = session.scalar(select(Membership).where(Membership.organization_id == self.org, Membership.user_id == admin_id))
                        session.delete(membership)
                    session.commit()
                self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
                self.assertEqual(self.task_count(), 0)

    def test_deadline_elapsed_during_dispatch_cannot_commit_a_task(self):
        _, _, _, _, _ = self.workflow(False)
        claim = claim_next_agent_action(self.database, self.settings)
        from backend.app.services import PlatformService
        original = PlatformService._run_is_live
        calls = 0

        def elapsed(run):
            nonlocal calls
            calls += 1
            if calls == 2:
                run.deadline_at = utcnow() - timedelta(seconds=1)
            return original(run)

        with patch.object(PlatformService, "_run_is_live", staticmethod(elapsed)):
            self.assertFalse(self.process(claim))
        self.assertEqual(self.task_count(), 0)

    def test_lease_elapsed_during_dispatch_rolls_back_without_failing_new_owner(self):
        _, _, run, _, action = self.workflow(False)
        claim = claim_next_agent_action(self.database, self.settings)
        from backend.app.services import PlatformService
        original_validate = PlatformService.validate_agent_task_input

        def expire_after_validation(service, principal, run_record, payload):
            evidence = original_validate(service, principal, run_record, payload)
            lease = service.session.get(AgentAction, action["id"])
            lease.lease_expires_at = utcnow() - timedelta(seconds=1)
            service.session.flush()
            return evidence

        with patch.object(PlatformService, "validate_agent_task_input", expire_after_validation):
            self.assertFalse(self.process(claim))
        self.assertEqual(self.task_count(), 0)
        with self.database.session_factory() as session:
            self.assertEqual(session.get(AgentRun, run["id"]).status, "running")
            self.assertEqual(session.get(AgentAction, action["id"]).lease_token, claim[1])

    def test_deleted_source_and_removed_assignee_prevent_task_creation(self):
        _, assignee = self.member("reviewer")
        for mutation in ("source", "assignee"):
            with self.subTest(mutation=mutation):
                contract_id, _ = self.seed_contract(self.org)
                self.contract = contract_id
                _, headers = self.agent(require_approval=False, assignee_ids=[assignee])
                payload = self.run_payload(idempotency_key=mutation)
                payload["success_condition"]["assigned_to_user_id"] = assignee
                run = self.client.post("/api/v1/agent/runs", headers=headers, json=payload).json()
                evidence = self.evidence(headers, run["id"])
                action = self.action_payload(evidence["id"], assigned_to_user_id=assignee)
                self.assertEqual(self.client.post(f"/api/v1/agent/runs/{run['id']}/actions", headers=headers, json=action).status_code, 202)
                with self.database.session_factory() as session:
                    if mutation == "source":
                        session.delete(session.get(Contract, contract_id))
                    else:
                        membership = session.scalar(select(Membership).where(Membership.organization_id == self.org, Membership.user_id == assignee))
                        session.delete(membership)
                    session.commit()
                self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
                self.assertEqual(self.task_count(), 0)

    def test_upload_review_agent_action_round_trip(self):
        uploaded = self.client.post(self.base + "/contracts", headers=self.alice,
                                    data={"retain_source_text": "true", "title": "Real upload"},
                                    files={"file": ("renewal.txt", self.source.encode(), "text/plain")})
        self.assertEqual(uploaded.status_code, 202, uploaded.text)
        self.contract = uploaded.json()["contract"]["id"]
        run_worker(self.settings, once=True, review_workflow_factory=lambda: build_review_workflow(contract_analyzer=lambda _text, _context: {}))
        _, headers, run, _, _ = self.workflow(False)
        run_worker(self.settings, once=True)
        completed = self.client.get(f"/api/v1/agent/runs/{run['id']}", headers=headers).json()
        self.assertEqual(completed["status"], "succeeded")
        self.assertEqual(completed["result"]["contract_id"], self.contract)


class AgentMigrationTests(unittest.TestCase):
    def test_migration_round_trip_matches_agent_models_and_preserves_existing_data(self):
        with tempfile.TemporaryDirectory() as temporary:
            settings = Settings(_env_file=None, environment="test", auth_mode="local", auto_create_schema=False,
                                database_url=f"sqlite:///{Path(temporary) / 'migrated.db'}")
            environment = {**os.environ, "LENSLAYER_PLATFORM_DATABASE_URL": settings.database_url,
                           "LENSLAYER_PLATFORM_ENVIRONMENT": "test", "LENSLAYER_PLATFORM_AUTH_MODE": "local"}
            root = Path(__file__).resolve().parents[1]

            def migrate(direction, target):
                result = subprocess.run([sys.executable, "-m", "alembic", "-c", "backend/alembic.ini", direction, target],
                                         cwd=root, env=environment, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)

            migrate("upgrade", "head")
            database = Database(settings)
            try:
                with database.engine.connect() as connection:
                    context = MigrationContext.configure(connection, opts={
                        "include_object": lambda obj, name, kind, reflected, comparison: (
                            name.startswith("agent_") if kind == "table" else True
                        ),
                    })
                    self.assertEqual(compare_metadata(context, Base.metadata), [])
                with TestClient(create_app(settings)) as client:
                    created = client.post("/api/v1/organizations", json={"name": "Preserved", "slug": "preserved"})
                    self.assertEqual(created.status_code, 201, created.text)
                migrate("downgrade", "4d2c8f1a9e77")
                migrate("upgrade", "head")
                with TestClient(create_app(settings)) as client:
                    organizations = client.get("/api/v1/organizations").json()
                    self.assertEqual(organizations[0]["name"], "Preserved")
                    agents = client.get(f"/api/v1/organizations/{organizations[0]['id']}/agents")
                    self.assertEqual(agents.status_code, 200)
                    self.assertEqual(agents.json(), [])
            finally:
                database.dispose()


if __name__ == "__main__":
    unittest.main()
