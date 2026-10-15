"""Real local API/SQL transactions and worker recovery; no cloud/model calls."""
import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack, contextmanager
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from alembic import command
from alembic.config import Config
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app import agent_wake, agent_worker_service
from backend.app.agent_generalization_models import ContextEvidence, ContextRecord, ContextVersion, WorkflowGraph, WorkflowGraphNode
from backend.app.agent_generalization_runtime import purge_expired_context, recover_workflow_graphs
from backend.app.agent_models import AgentAction, AgentPrincipal, AgentRun
from backend.app.agent_runtime import claim_next_agent_action, expire_agent_runs
from backend.app.config import Settings
from backend.app.database import Base, Database
from backend.app.models import Membership, WorkflowTask, utcnow
from backend.app.service_domains.agents import canonical_json, digest
from backend.app.service_domains.common import aware
from backend.app.services import PlatformService
from backend.app.worker import run_worker
from tests import test_agent_infrastructure as fixtures


class GeneralizationTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.AgentInfrastructureTests(methodName="runTest")
        self.fixture.setUp()
        self.text = "Private onboarding 📄 notes. The customer needs a follow-up from the assigned owner."
        self.record = self.create_record()

    def __getattr__(self, name):
        fixture = self.__dict__.get("fixture")
        if fixture is None:
            raise AttributeError(name)
        return getattr(fixture, name)

    def tearDown(self):
        self.fixture.tearDown()

    def create_record(self, **overrides):
        response = self.client.post(self.base + "/context-records", headers=self.alice, json={
            "title": "Customer notes", "text": self.text,
            "expires_at": (utcnow() + timedelta(days=10)).isoformat(), **overrides})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def context_agent(self, **overrides):
        return self.agent(contract_ids=[], context_ids=[self.record["id"]],
            allowed_tools=["context.retrieve", "workspace.context_tasks.create"], max_actions_per_run=20, **overrides)

    def node(self, node_id="follow-up", **overrides):
        return {"id": node_id, "depends_on": [], "task": {"context_id": self.record["id"],
            "query": "owner customer", "assigned_to_user_id": self.owner, "title": "Contact customer owner",
            "description": "Ask about onboarding.", "due_at": self.due}, **overrides}

    def graph_payload(self, **overrides):
        return {"idempotency_key": "context-graph-1", "goal": "Create assigned follow-ups, not perform them",
            "context_ids": [self.record["id"]], "deadline_at": (utcnow() + timedelta(minutes=50)).isoformat(),
            "nodes": [self.node()], **overrides}

    def graph(self, headers, payload=None):
        response = self.client.post("/api/v1/agent/workflow-graphs", headers=headers, json=payload or self.graph_payload())
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def actions(self, headers, run):
        response = self.client.get(f"/api/v1/agent/runs/{run['id']}/actions", headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        return {a["input"]["condition_id"]: a for a in response.json()}

    def read(self, headers, run):
        response = self.client.get(f"/api/v1/agent/runs/{run['id']}", headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def progress(self, headers, run):
        response = self.client.get(f"/api/v1/agent/runs/{run['id']}/graph", headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        return {n["id"]: n for n in response.json()["nodes"]}

    def run_graph(self):
        with patch("backend.app.worker.time.sleep", side_effect=AssertionError("No idle polling")):
            run_worker(self.settings, drain=True, agents_only=True)

    @contextmanager
    def clock(self, now):
        with ExitStack() as stack:
            for module in ("agent_runtime", "agent_wake", "agent_worker_service", "agent_generalization_runtime", "worker",
                           "service_domains.agents", "service_domains.agent_generalization"):
                stack.enter_context(patch("backend.app." + module + ".utcnow", return_value=now))
            yield

    def test_context_crud_is_private_versioned_and_retention_is_not_extendable(self):
        viewer, _ = self.member()
        url = self.base + "/context-records/" + self.record["id"]
        first = self.client.get(url + "/versions/1", headers=viewer)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["text"], self.text)
        self.assertEqual(first.json()["source_sha256"], hashlib.sha256(self.text.encode()).hexdigest())
        self.assertNotIn("text", self.client.get(self.base + "/context-records", headers=viewer).text)
        self.assertEqual(self.client.post(url + "/versions", headers=viewer,
            json={"expected_version": 1, "text": "Not allowed"}).status_code, 403)
        updated = self.client.post(url + "/versions", headers=self.alice,
            json={"expected_version": 1, "text": "Revised customer onboarding owner notes"})
        self.assertEqual(updated.status_code, 201)
        self.assertEqual(updated.json()["current_version"], 2)
        self.assertEqual(updated.json()["expires_at"], self.record["expires_at"])
        self.assertEqual(self.client.post(url + "/versions", headers=self.alice,
            json={"expected_version": 1, "text": "Race"}).status_code, 409)
        self.assertEqual(self.client.post(url + "/versions", headers=self.alice,
            json={"expected_version": 2, "text": "Extend", "expires_at": self.record["expires_at"]}).status_code, 422)
        self.assertEqual(self.client.get(url + "/versions/1", headers=self.alice).json()["text"], self.text)
        self.assertEqual(self.client.delete(url, headers=viewer).status_code, 403)
        self.assertEqual(self.client.delete(url, headers=self.alice).status_code, 204)
        self.assertEqual(self.client.delete(url, headers=self.alice).status_code, 204)
        self.assertEqual(self.client.get(url + "/versions/1", headers=self.alice).status_code, 409)
        with self.database.session_factory() as session:
            versions = session.scalars(select(ContextVersion).where(ContextVersion.record_id == self.record["id"])).all()
            self.assertTrue(all(v.text is None for v in versions))
            self.assertTrue(all(v.source_sha256 for v in versions))

    def test_tenant_agent_and_human_boundaries_cover_every_new_read(self):
        _, headers = self.context_agent()
        run = self.graph(headers)
        action = self.actions(headers, run)["follow-up"]
        evidence_id = action["input"]["evidence_id"]
        outsider = {"X-LensLayer-User": "outsider"}
        other = self.client.post("/api/v1/organizations", headers=outsider,
            json={"name": "Foreign", "slug": "foreign"}).json()["id"]
        other_base = f"/api/v1/organizations/{other}"
        for suffix in ("", "/versions/1"):
            self.assertEqual(self.client.get(other_base + "/context-records/" + self.record["id"] + suffix,
                headers=outsider).status_code, 404)
            self.assertEqual(self.client.get(self.base + "/context-records/" + self.record["id"] + suffix,
                headers=headers).status_code, 401)
        for suffix in ("graph", "context-evidence/" + evidence_id):
            self.assertEqual(self.client.get(other_base + f"/agent-runs/{run['id']}/" + suffix,
                headers=outsider).status_code, 404)
        _, other_headers = self.context_agent()
        self.assertEqual(self.client.get(f"/api/v1/agent/runs/{run['id']}/graph", headers=other_headers).status_code, 404)
        foreign = self.client.post(other_base + "/context-records", headers=outsider, json={
            "title": "Foreign", "text": self.text, "expires_at": self.record["expires_at"]}).json()
        delegated = self.client.post(self.base + "/agents", headers=self.alice,
            json=self.agent_payload(contract_ids=[], context_ids=[foreign["id"]]))
        self.assertEqual(delegated.status_code, 404)
        response = self.client.post(f"/api/v1/agent/runs/{run['id']}/context-evidence", headers=headers,
            json={"context_ids": [foreign["id"]], "query": "customer"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.approve(run["id"], action["id"], headers=headers).status_code, 401)

    def test_lexical_multi_term_ranking_original_unicode_offsets_and_budget(self):
        second_text = "Customer owner onboarding"  # tighter span ranks first
        second = self.create_record(text=second_text)
        agent, headers = self.agent(contract_ids=[], context_ids=[self.record["id"], second["id"]],
            allowed_tools=["context.retrieve", "workspace.context_tasks.create"], max_actions_per_run=20)
        planning = self.client.post("/api/v1/agent/context-search", headers=headers,
            json={"context_ids": agent["context_ids"], "query": "OWNER customer"})
        self.assertEqual(planning.status_code, 200, planning.text)
        self.assertEqual([h["context_id"] for h in planning.json()], [second["id"], self.record["id"]])
        with self.database.session_factory() as session:
            self.assertEqual(session.scalars(select(ContextEvidence)).all(), [])
            self.assertEqual(session.scalars(select(AgentRun)).all(), [])
        run = self.graph(headers, self.graph_payload(context_ids=agent["context_ids"]))
        url = f"/api/v1/agent/runs/{run['id']}/context-evidence"
        search = {"context_ids": agent["context_ids"], "query": "OWNER customer"}
        response = self.client.post(url, headers=headers, json=search)
        self.assertEqual(response.status_code, 200, response.text)
        receipts = response.json()
        self.assertEqual([r["context_id"] for r in receipts], [second["id"], self.record["id"]])
        for receipt, text in zip(receipts, [second_text, self.text]):
            self.assertEqual(receipt["excerpt"], text[receipt["start_offset"]:receipt["end_offset"]])
            self.assertEqual(receipt["source_sha256"], digest(text))
            self.assertEqual(self.client.get(url + "/" + receipt["id"], headers=headers).json(), receipt)
        self.assertEqual(self.client.post(url, headers=headers, json={**search, "query": "customer absent"}).status_code, 404)
        self.assertEqual(self.client.post(url, headers=headers, json={**search, "query": "***"}).status_code, 422)
        self.settings.agent_max_evidence_receipts_per_run = 3
        self.assertEqual(self.client.post(url, headers=headers, json=search).status_code, 409)
        with self.database.session_factory() as session:
            self.assertFalse(hasattr(session.get(ContextEvidence, receipts[0]["id"]), "excerpt"))
        events = self.client.get(f"/api/v1/agent/runs/{run['id']}/events", headers=headers).json()
        self.assertNotIn(self.text, json.dumps(events))

    def test_context_follow_up_exact_readback_and_all_existing_human_task_reads(self):
        _, headers = self.context_agent()
        run = self.graph(headers)
        action = self.actions(headers, run)["follow-up"]
        self.assertIsNone(claim_next_agent_action(self.database, self.settings))
        self.assertEqual(self.approve(run["id"], action["id"]).status_code, 200)
        self.run_graph()
        finished = self.read(headers, run)
        self.assertEqual(finished["status"], "succeeded")
        self.assertTrue(finished["result"]["verified"])
        task_id = finished["result"]["completed_nodes"]["follow-up"]["result"]["task_id"]
        tasks = self.client.get(self.base + "/tasks", headers=self.alice)
        self.assertEqual(tasks.status_code, 200, tasks.text)
        task = next(t for t in tasks.json() if t["id"] == task_id)
        self.assertIsNone(task["contract_id"])
        self.assertIsNone(task["contract_title"])
        self.assertEqual(task["status"], "open")  # does not claim follow-up performed
        self.assertIsNone(task["completed_at"])
        self.assertEqual(task["source_reference"]["context_id"], self.record["id"])
        # Actual additional human read route names are established in source.
        self.assertEqual(self.client.get(self.base + "/reports/overview", headers=self.alice).status_code, 200)
        self.assertEqual(self.client.get(self.base + "/reports/export", headers=self.alice).status_code, 200)
        self.assertEqual(self.client.get(self.base + "/calendar.ics", headers=self.alice).status_code, 200)
        self.assertEqual(self.progress(headers, run)["follow-up"]["status"], "completed")
        self.run_graph()
        self.assertEqual(self.task_count(), 1)

    def test_dependency_order_and_true_false_branches_are_approved_not_status_flags(self):
        _, headers = self.context_agent()
        nodes = [self.node("tail", depends_on=["false"]),
            self.node("false", depends_on=["true"], when={"fact": "needs_follow_up", "value": True, "equals": False}),
            self.node("true", when={"fact": "needs_follow_up", "value": True, "equals": True})]
        run = self.graph(headers, self.graph_payload(nodes=nodes))
        actions = self.actions(headers, run)
        self.assertEqual(self.approve(run["id"], actions["tail"]["id"]).status_code, 200)
        self.assertEqual(self.approve(run["id"], actions["false"]["id"]).status_code, 200)
        self.assertIsNone(claim_next_agent_action(self.database, self.settings))
        self.assertEqual(self.progress(headers, run)["false"]["status"], "blocked")
        self.assertEqual(self.approve(run["id"], actions["true"]["id"]).status_code, 200)
        claim = claim_next_agent_action(self.database, self.settings)
        self.assertEqual(claim[0], actions["true"]["id"])
        self.assertTrue(self.process(claim))
        self.assertEqual(self.progress(headers, run)["false"]["status"], "skipped")
        self.run_graph()
        self.assertEqual(self.task_count(), 2)
        final = self.read(headers, run)
        self.assertEqual(final["status"], "succeeded")
        self.assertEqual(final["result"]["skipped_node_ids"], ["false"])
        self.assertEqual(set(final["result"]["completed_nodes"]), {"true", "tail"})
        skipped = self.actions(headers, run)["false"]
        self.assertEqual(skipped["attempts"], 0)
        self.assertEqual(skipped["error_code"], "branch_false")
        self.assertFalse(skipped["result"].get("verified", False))

    def test_all_false_graph_has_zero_effects_and_requires_human_approval(self):
        _, headers = self.context_agent()
        run = self.graph(headers, self.graph_payload(nodes=[self.node(when={"fact": "needed", "value": False, "equals": True})]))
        self.run_graph()
        self.assertEqual(self.read(headers, run)["status"], "awaiting_approval")
        action = self.actions(headers, run)["follow-up"]
        self.assertEqual(self.approve(run["id"], action["id"]).status_code, 200)
        self.assertEqual(self.read(headers, run)["status"], "succeeded")
        self.assertEqual(self.task_count(), 0)
        _, unapproved_headers = self.context_agent(require_approval=False)
        response = self.client.post("/api/v1/agent/workflow-graphs", headers=unapproved_headers,
            json=self.graph_payload(nodes=[self.node(when={"fact": "needed", "value": False, "equals": True})]))
        self.assertEqual(response.status_code, 422)

    def test_graph_rejects_cycles_unknown_dependencies_budget_and_code(self):
        _, headers = self.context_agent()
        cases = [([self.node("a", depends_on=["b"]), self.node("b", depends_on=["a"])], 422),
            ([self.node(depends_on=["unknown"])], 422), ([self.node(depends_on=["follow-up"])], 422),
            ([self.node(), self.node()], 422), ([self.node("a"), self.node("b", depends_on=["a", "a"])], 422),
            ([self.node(when={"fact": "needed", "value": True, "equals": True, "expression": "exec('bad')"})], 422),
            ([self.node(when={"fact": "needed", "value": "true", "equals": True})], 422),
            ([self.node(str(i)) for i in range(21)], 422)]
        for nodes, expected in cases:
            with self.subTest(nodes=nodes):
                response = self.client.post("/api/v1/agent/workflow-graphs", headers=headers,
                    json=self.graph_payload(nodes=nodes))
                self.assertEqual(response.status_code, expected, response.text)
        _, small = self.agent(contract_ids=[], context_ids=[self.record["id"]],
            allowed_tools=["context.retrieve", "workspace.context_tasks.create"], max_actions_per_run=1)
        response = self.client.post("/api/v1/agent/workflow-graphs", headers=small,
            json=self.graph_payload(nodes=[self.node("a"), self.node("b")]))
        self.assertEqual(response.status_code, 403)
        with self.database.session_factory() as session:
            self.assertEqual(session.scalars(select(WorkflowGraph)).all(), [])

    def test_graph_replay_restart_conflicting_plan_and_no_new_actions_or_input(self):
        _, headers = self.context_agent(require_approval=False)
        payload = self.graph_payload(nodes=[self.node("a"), self.node("b", depends_on=["a"])])
        run = self.graph(headers, payload)
        actions = self.actions(headers, run)
        first = claim_next_agent_action(self.database, self.settings)
        self.assertTrue(self.process(first))
        replay = self.graph(headers, payload)
        self.assertEqual(replay["id"], run["id"])
        self.assertEqual(set(self.read(headers, run)["result"]["completed_nodes"]), {"a"})
        recover_workflow_graphs(self.database, self.settings, self.store)
        code = """
import sys, dotenv
dotenv.load_dotenv = lambda *args, **kwargs: False
from backend.app.config import Settings
Settings.model_config['env_file'] = None
from backend.app.worker import run_worker
settings = Settings(_env_file=None, environment='test', auth_mode='local', auto_create_schema=False,
    database_url=sys.argv[1], object_storage_root=sys.argv[2])
run_worker(settings, drain=True, agents_only=True)
"""
        restarted = subprocess.run([sys.executable, "-c", code, self.settings.database_url,
            str(self.settings.object_storage_root)], cwd=Path(__file__).resolve().parents[1],
            env={"PATH": str(Path(sys.executable).parent) + ":/usr/bin:/bin"}, capture_output=True, text=True, timeout=30)
        self.assertEqual(restarted.returncode, 0, restarted.stderr)
        self.assertEqual({k: v["id"] for k, v in self.actions(headers, run).items()},
                         {k: v["id"] for k, v in actions.items()})
        self.assertEqual(self.graph(headers, payload)["id"], run["id"])
        changed = copy.deepcopy(payload)
        changed["nodes"][1]["task"]["title"] = "Changed plan"
        self.assertEqual(self.client.post("/api/v1/agent/workflow-graphs", headers=headers, json=changed).status_code, 409)
        self.assertEqual(self.task_count(), 2)
        run2 = self.graph(headers, self.graph_payload(idempotency_key="immutable"))
        old_action = self.action_payload("not-applicable")
        self.assertEqual(self.client.post(f"/api/v1/agent/runs/{run2['id']}/actions", headers=headers, json=old_action).status_code, 409)
        self.assertEqual(self.client.post(f"/api/v1/agent/runs/{run2['id']}/input-requests", headers=headers, json={
            "idempotency_key": "new-facts", "reason": "Change scope", "fields": [{"name": "needed", "type": "boolean", "prompt": "Needed?"}],
            "expires_at": run2["deadline_at"]}).status_code, 409)

    def test_concurrent_graph_creation_and_claims_do_not_duplicate_effects(self):
        _, headers = self.context_agent(require_approval=False)
        payload = self.graph_payload()
        with ThreadPoolExecutor(max_workers=4) as pool:
            responses = list(pool.map(lambda _: self.client.post("/api/v1/agent/workflow-graphs", headers=headers, json=payload), range(4)))
        self.assertTrue(all(r.status_code == 201 for r in responses), [r.text for r in responses])
        self.assertEqual(len({r.json()["id"] for r in responses}), 1)
        with ThreadPoolExecutor(max_workers=4) as pool:
            claims = list(pool.map(lambda _: claim_next_agent_action(self.database, self.settings), range(4)))
        winners = [c for c in claims if c]
        self.assertEqual(len(winners), 1)
        self.assertTrue(self.process(winners[0]))
        self.assertEqual(self.task_count(), 1)

    def test_crash_rollback_fencing_and_recovery_preserve_ids(self):
        _, headers = self.context_agent(require_approval=False)
        run = self.graph(headers)
        action = self.actions(headers, run)["follow-up"]
        with self.database.session_factory() as session:
            output_id = session.get(AgentAction, action["id"]).output_id
        claim = claim_next_agent_action(self.database, self.settings)
        original = PlatformService._event

        def crash(service, record, kind, data=None):
            if kind == "graph.checkpoint":
                raise RuntimeError("Crash before commit")
            return original(service, record, kind, data)

        with patch.object(PlatformService, "_event", crash), self.assertRaises(RuntimeError):
            self.process(claim)
        self.assertEqual(self.task_count(), 0)
        with self.database.session_factory() as session:
            session.get(AgentAction, action["id"]).lease_expires_at = utcnow() - timedelta(seconds=1)
            session.commit()
        recovered = claim_next_agent_action(self.database, self.settings)
        self.assertEqual(recovered[0], claim[0])
        self.assertNotEqual(recovered[1], claim[1])
        self.assertFalse(self.process(claim))
        self.assertTrue(self.process(recovered))
        self.assertFalse(self.process(recovered))
        with self.database.session_factory() as session:
            self.assertIsNotNone(session.get(WorkflowTask, output_id))
        self.assertEqual(self.task_count(), 1)

    def test_narrowing_revocation_and_stale_source_block_approval_or_dispatch(self):
        agent, headers = self.context_agent()
        run = self.graph(headers)
        action = self.actions(headers, run)["follow-up"]
        url = self.base + f"/agents/{agent['id']}/context-scope"
        self.assertEqual(self.client.post(url, headers=headers, json={"context_ids": []}).status_code, 401)
        self.assertEqual(self.client.post(url, headers=self.alice, json={"context_ids": ["extra"]}).status_code, 403)
        self.assertEqual(self.client.post(url, headers=self.alice, json={"context_ids": []}).status_code, 200)
        evidence_url = f"/api/v1/agent/runs/{run['id']}/context-evidence/{action['input']['evidence_id']}"
        self.assertEqual(self.client.get(evidence_url, headers=headers).status_code, 403)
        self.assertEqual(self.approve(run["id"], action["id"]).status_code, 409)
        self.run_graph()
        self.assertEqual(self.task_count(), 0)
        agent, headers = self.context_agent()
        run = self.graph(headers)
        action = self.actions(headers, run)["follow-up"]
        update_url = self.base + "/context-records/" + self.record["id"] + "/versions"
        self.assertEqual(self.client.post(update_url, headers=self.alice, json={
            "expected_version": 1, "text": "Updated customer owner onboarding"}).status_code, 201)
        self.assertEqual(self.approve(run["id"], action["id"]).status_code, 409)
        run2 = self.graph(headers, self.graph_payload(idempotency_key="latest"))
        action2 = self.actions(headers, run2)["follow-up"]
        self.assertEqual(self.approve(run2["id"], action2["id"]).status_code, 200)
        claim = claim_next_agent_action(self.database, self.settings)
        self.assertEqual(self.client.post(self.base + f"/agents/{agent['id']}/revoke", headers=self.alice).status_code, 200)
        self.assertFalse(self.process(claim))
        self.assertEqual(self.task_count(), 0)

    def test_changed_version_after_approval_and_approval_hash_or_authority_are_rechecked(self):
        admin, admin_id = self.member("admin")
        for mutation in ("version", "hash", "authority", "expired", "plan"):
            with self.subTest(mutation=mutation):
                _, headers = self.context_agent()
                run = self.graph(headers, self.graph_payload(idempotency_key=mutation))
                action = self.actions(headers, run)["follow-up"]
                self.assertEqual(self.approve(run["id"], action["id"], headers=admin).status_code, 200)
                with self.database.session_factory() as session:
                    row = session.get(AgentAction, action["id"])
                    if mutation == "version":
                        record = session.get(ContextRecord, self.record["id"])
                        record.current_version += 1
                        session.add(ContextVersion(record_id=record.id, version_number=record.current_version,
                            text=self.text, source_sha256=digest(self.text)))
                    elif mutation == "hash":
                        row.approved_input_sha256 = "0" * 64
                    elif mutation == "authority":
                        session.scalar(select(Membership).where(Membership.organization_id == self.org,
                            Membership.user_id == admin_id)).role = "viewer"
                    elif mutation == "expired":
                        row.approval_expires_at = utcnow() - timedelta(seconds=1)
                    else:
                        session.get(WorkflowGraph, run["id"]).plan_json = "{}"
                    session.commit()
                self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
                self.assertEqual(self.task_count(), 0)
                with self.database.session_factory() as session:
                    session.scalar(select(Membership).where(Membership.organization_id == self.org,
                        Membership.user_id == admin_id)).role = "admin"
                    session.commit()

    def test_context_evidence_read_rechecks_grant_changed_after_authentication(self):
        original = PlatformService.read_context_evidence
        for mutation, expected_status in (("narrow", 403), ("revoke", 401)):
            with self.subTest(mutation=mutation):
                _, headers = self.context_agent()
                run = self.graph(headers)
                evidence_id = self.actions(headers, run)["follow-up"]["input"]["evidence_id"]
                url = f"/api/v1/agent/runs/{run['id']}/context-evidence/{evidence_id}"
                self.assertEqual(self.client.get(url, headers=headers).status_code, 200)
                interleaved = []

                def change_grant(service, scoped_run, receipt_id, *, agent=None):
                    # Pause after the real bearer authentication/run lookup, then
                    # commit a real administrative request in another session.
                    # Do not mock the authorization or retained-source checks.
                    self.assertIsNotNone(agent)
                    route = self.base + f"/agents/{agent.id}/"
                    response = (self.client.post(route + "context-scope", headers=self.alice,
                        json={"context_ids": []}) if mutation == "narrow" else
                        self.client.post(route + "revoke", headers=self.alice))
                    self.assertEqual(response.status_code, 200, response.text)
                    interleaved.append(mutation)
                    return original(service, scoped_run, receipt_id, agent=agent)

                with patch.object(PlatformService, "read_context_evidence", change_grant):
                    response = self.client.get(url, headers=headers)
                self.assertEqual(interleaved, [mutation])
                self.assertEqual(response.status_code, expected_status, response.text)
                self.assertNotIn(self.text, response.text)
                # Revoking an agent does not revoke human workspace membership
                # or erase retained historical evidence.
                human = self.client.get(self.base + f"/agent-runs/{run['id']}/context-evidence/{evidence_id}",
                    headers=self.alice)
                self.assertEqual(human.status_code, 200, human.text)
                self.assertEqual(human.json()["excerpt"], self.text)

    def test_expired_or_deleted_sources_erase_text_fail_wait_and_have_no_effect(self):
        _, headers = self.context_agent()
        run = self.graph(headers)
        action = self.actions(headers, run)["follow-up"]
        self.assertEqual(self.approve(run["id"], action["id"]).status_code, 200)
        with self.database.session_factory() as session:
            session.get(ContextRecord, self.record["id"]).expires_at = utcnow() - timedelta(seconds=1)
            session.commit()
        self.assertEqual(expire_agent_runs(self.database, self.settings, self.store), 1)
        self.assertEqual(purge_expired_context(self.database), 1)
        self.assertEqual(purge_expired_context(self.database), 0)
        self.assertEqual(self.read(headers, run)["error_code"], "source_unavailable")
        self.assertEqual(self.client.get(f"/api/v1/agent/runs/{run['id']}/context-evidence/{action['input']['evidence_id']}",
            headers=headers).status_code, 409)
        self.assertIsNone(claim_next_agent_action(self.database, self.settings))
        self.assertEqual(self.task_count(), 0)

    def test_scheduled_graph_parks_and_cloud_timer_recovery_does_not_poll(self):
        _, headers = self.context_agent()
        start = utcnow()
        scheduled = start + timedelta(minutes=20)
        run = self.graph(headers, self.graph_payload(nodes=[self.node(not_before_at=scheduled.isoformat())]))
        action = self.actions(headers, run)["follow-up"]
        self.assertEqual(self.approve(run["id"], action["id"]).status_code, 200)
        self.assertIsNone(claim_next_agent_action(self.database, self.settings))
        with self.database.session_factory() as session:
            self.assertEqual(agent_wake.next_agent_wake_at(session), scheduled)
        self.run_graph()
        self.assertEqual(self.actions(headers, run)["follow-up"]["attempts"], 0)
        self.settings.agent_worker_mode = "on_demand"
        self.settings.agent_worker_url = "https://example-worker.a.run.app"
        self.settings.agent_worker_queue = "projects/lenslayer/locations/europe-west1/queues/agents"
        self.settings.agent_worker_invoker_email = "wake@lenslayer.iam.gserviceaccount.com"
        enqueued = []

        import httpx
        def transport(request):
            if request.url.host == "metadata.google.internal":
                return httpx.Response(200, json={"access_token": "fake-local-token"})
            enqueued.append(json.loads(request.content)["task"])
            return httpx.Response(200)

        with self.clock(start):
            self.assertTrue(agent_wake.enqueue_next_agent_wake(self.database, self.settings,
                transport=httpx.MockTransport(transport)))
        self.assertGreater(enqueued[0]["scheduleTime"], scheduled.isoformat().replace("+00:00", "Z"))
        original_enqueue = agent_wake.enqueue_next_agent_wake
        with patch.object(agent_worker_service, "enqueue_next_agent_wake", side_effect=lambda db, config, **kw:
                original_enqueue(db, config, transport=httpx.MockTransport(transport), **kw)), \
             TestClient(agent_worker_service.create_worker_application(self.settings)) as worker:
            with patch("backend.app.worker.run_worker", side_effect=AssertionError("Future timer is not runnable")):
                self.assertEqual(worker.post("/recover").json()["status"], "idle")
            with self.clock(scheduled + timedelta(seconds=1)), \
                 patch("backend.app.worker.time.sleep", side_effect=AssertionError("No idle polling")):
                self.assertEqual(worker.post("/recover").json()["status"], "drained")
        self.assertEqual(self.read(headers, run)["status"], "succeeded")
        self.assertEqual(self.actions(headers, run)["follow-up"]["id"], action["id"])
        self.assertEqual(self.task_count(), 1)
        # Only retention maintenance remains, not a graph execution wake.
        with self.database.session_factory() as session:
            self.assertEqual(agent_wake.next_agent_wake_at(session), aware(session.get(ContextRecord, self.record["id"]).expires_at))

    def test_timer_limits_delegation_retention_and_approval_windows_are_bounded(self):
        _, headers = self.context_agent()
        for changes in ({"deadline_at": (utcnow() + timedelta(days=30)).isoformat()},
                        {"deadline_at": (utcnow() + timedelta(days=11)).isoformat()},
                        {"nodes": [self.node(not_before_at=(utcnow() + timedelta(hours=2)).isoformat())]},
                        {"nodes": [self.node(not_before_at=(utcnow() + timedelta(days=1)).isoformat())]}):
            response = self.client.post("/api/v1/agent/workflow-graphs", headers=headers, json=self.graph_payload(**changes))
            self.assertEqual(response.status_code, 422, response.text)

    def test_deadline_boundaries_include_all_scoped_records_and_horizon(self):
        now = utcnow()
        self.record = self.create_record(expires_at=(now + timedelta(days=40)).isoformat())
        _, headers = self.context_agent(require_approval=False, expires_at=(now + timedelta(days=35)).isoformat())
        with self.clock(now):
            for deadline, status in ((now, 422), (now + timedelta(days=29), 201),
                                     (now + timedelta(days=29, microseconds=1), 422)):
                response = self.client.post("/api/v1/agent/workflow-graphs", headers=headers,
                    json=self.graph_payload(idempotency_key=deadline.isoformat(), deadline_at=deadline.isoformat()))
                self.assertEqual(response.status_code, status, response.text)
            exact = now + timedelta(days=20)
            _, short_headers = self.context_agent(require_approval=False, expires_at=exact.isoformat())
            for deadline, status in ((exact, 201), (exact + timedelta(microseconds=1), 422)):
                response = self.client.post("/api/v1/agent/workflow-graphs", headers=short_headers,
                    json=self.graph_payload(idempotency_key=deadline.isoformat(), deadline_at=deadline.isoformat()))
                self.assertEqual(response.status_code, status, response.text)
            # Even an explicitly scoped record unused by the node bounds the run.
            unused = self.create_record(expires_at=(now + timedelta(days=5)).isoformat())
            ids = [self.record["id"], unused["id"]]
            _, scoped_headers = self.agent(contract_ids=[], context_ids=ids, require_approval=False,
                allowed_tools=["context.retrieve", "workspace.context_tasks.create"])
            for deadline, status in ((now + timedelta(days=5), 201),
                                     (now + timedelta(days=5, microseconds=1), 422)):
                response = self.client.post("/api/v1/agent/workflow-graphs", headers=scoped_headers,
                    json=self.graph_payload(context_ids=ids, idempotency_key=deadline.isoformat(),
                        deadline_at=deadline.isoformat()))
                self.assertEqual(response.status_code, status, response.text)


    def test_maximum_reverse_ordered_graph_drains_once_and_replay_keeps_all_ids(self):
        _, headers = self.context_agent(require_approval=False)
        nodes = [self.node(f"n{i}", depends_on=[f"n{i - 1}"] if i else []) for i in reversed(range(20))]
        payload = self.graph_payload(nodes=nodes)
        run = self.graph(headers, payload)
        original = self.actions(headers, run)
        self.run_graph()
        self.assertEqual(self.read(headers, run)["status"], "succeeded")
        self.assertEqual(self.task_count(), 20)
        self.assertTrue(all(n["status"] == "completed" for n in self.progress(headers, run).values()))
        self.assertEqual(self.graph(headers, payload)["id"], run["id"])
        self.assertEqual({k: a["id"] for k, a in self.actions(headers, run).items()},
                         {k: a["id"] for k, a in original.items()})
        self.run_graph()
        self.assertEqual(self.task_count(), 20)

    def test_readback_mismatch_never_claims_business_completion(self):
        _, headers = self.context_agent(require_approval=False)
        run = self.graph(headers)
        action = self.actions(headers, run)["follow-up"]
        with self.database.session_factory() as session:
            row = session.get(AgentAction, action["id"])
            session.add(WorkflowTask(id=row.output_id, organization_id=self.org, contract_id=None,
                created_by_user_id=self.owner, assigned_to_user_id=self.owner,
                title="Different business goal", description="Unrelated", status="done"))
            session.commit()
        self.assertFalse(self.process(claim_next_agent_action(self.database, self.settings)))
        final = self.read(headers, run)
        self.assertEqual(final["status"], "failed")
        self.assertFalse(final["result"]["verified"])
        self.assertEqual(final["result"]["completed_nodes"], {})

    def test_deleted_source_wait_is_recovered_without_an_api_nudge(self):
        _, headers = self.context_agent()
        run = self.graph(headers)
        self.assertEqual(self.client.delete(self.base + "/context-records/" + self.record["id"],
            headers=self.alice).status_code, 204)
        with self.database.session_factory() as session:
            self.assertLessEqual(agent_wake.next_agent_wake_at(session), utcnow())
        self.run_graph()
        self.assertEqual(self.read(headers, run)["status"], "failed")
        self.assertEqual(self.task_count(), 0)
        with self.database.session_factory() as session:
            self.assertIsNone(agent_wake.next_agent_wake_at(session))

    def test_continuous_worker_sleeps_when_only_future_or_blocked_actions_exist(self):
        _, headers = self.context_agent(require_approval=False)
        self.graph(headers, self.graph_payload(nodes=[self.node("parent", not_before_at=(utcnow() + timedelta(minutes=20)).isoformat()),
            self.node("child", depends_on=["parent"])]))
        class Slept(Exception):
            pass
        with patch("backend.app.worker.time.sleep", side_effect=Slept) as sleep, self.assertRaises(Slept):
            run_worker(self.settings, agents_only=True)
        sleep.assert_called_once_with(self.settings.worker_poll_seconds)
        self.assertEqual(self.task_count(), 0)

    def test_committed_graph_approval_recovers_a_lost_wake_without_new_ids(self):
        _, headers = self.context_agent()
        run = self.graph(headers)
        action = self.actions(headers, run)["follow-up"]
        self.settings.agent_worker_mode = "on_demand"
        with patch.object(agent_wake, "enqueue_next_agent_wake", return_value=False):
            self.assertEqual(self.approve(run["id"], action["id"]).status_code, 200)
        with self.database.session_factory() as session:
            self.assertLessEqual(agent_wake.next_agent_wake_at(session), utcnow())
        with patch.object(agent_worker_service, "enqueue_next_agent_wake", return_value=True), \
             patch("backend.app.worker.time.sleep", side_effect=AssertionError("No idle polling")), \
             TestClient(agent_worker_service.create_worker_application(self.settings)) as worker:
            self.assertEqual(worker.post("/recover").json()["status"], "drained")
            self.assertEqual(worker.post("/recover").json()["status"], "idle")
        self.assertEqual(self.read(headers, run)["status"], "succeeded")
        self.assertEqual(self.actions(headers, run)["follow-up"]["id"], action["id"])
        self.assertEqual(self.task_count(), 1)

    def test_concurrent_version_append_uses_optimistic_concurrency(self):
        url = self.base + "/context-records/" + self.record["id"] + "/versions"
        with ThreadPoolExecutor(max_workers=2) as pool:
            replies = list(pool.map(lambda i: self.client.post(url, headers=self.alice,
                json={"expected_version": 1, "text": f"Version {i} customer owner onboarding"}), range(2)))
        self.assertEqual(sorted(r.status_code for r in replies), [201, 409])
        with self.database.session_factory() as session:
            versions = session.scalars(select(ContextVersion).where(
                ContextVersion.record_id == self.record["id"]).order_by(ContextVersion.version_number)).all()
            self.assertEqual([v.version_number for v in versions], [1, 2])

    def test_openapi_exposes_exact_closed_context_and_graph_interfaces(self):
        schema = self.app.openapi()
        self.assertIn("/api/v1/agent/context-search", schema["paths"])
        self.assertIn("/api/v1/agent/workflow-graphs", schema["paths"])
        definitions = schema["components"]["schemas"]
        self.assertEqual(definitions["WorkflowGraphCreate"]["properties"]["nodes"]["maxItems"], 20)
        self.assertFalse(definitions["WorkflowGraphCreate"]["additionalProperties"])
        predicate = definitions["FactualPredicate"]
        self.assertFalse(predicate["additionalProperties"])
        self.assertEqual(predicate["properties"]["value"]["type"], "boolean")
        self.assertEqual(predicate["properties"]["equals"]["type"], "boolean")

    def test_factual_predicates_reject_non_boolean_json_without_creating_work(self):
        _, headers = self.context_agent()
        for field in ("value", "equals"):
            for value in ("true", "false", "yes", "no", "1", "0", 1, 0, 1.0, 0.0, None, [], {}):
                with self.subTest(field=field, value=value):
                    predicate = {"fact": "needed", "value": True, "equals": False, field: value}
                    response = self.client.post("/api/v1/agent/workflow-graphs", headers=headers,
                        json=self.graph_payload(nodes=[self.node(when=predicate)]))
                    self.assertEqual(response.status_code, 422, response.text)
                    self.assertIn(["body", "nodes", 0, "when", field],
                        [e["loc"] for e in response.json()["detail"]])
        with self.database.session_factory() as session:
            for model in (AgentRun, AgentAction, ContextEvidence, WorkflowGraph, WorkflowGraphNode):
                self.assertEqual(session.scalars(select(model)).all(), [])
        run = self.graph(headers, self.graph_payload(nodes=[self.node(
            when={"fact": "needed", "value": False, "equals": True})]))
        action = self.actions(headers, run)["follow-up"]
        self.assertIs(action["input"]["when"]["value"], False)
        self.assertIs(action["input"]["when"]["equals"], True)
        self.assertEqual(self.approve(run["id"], action["id"]).status_code, 200)
        self.assertEqual(self.read(headers, run)["result"]["skipped_node_ids"], ["follow-up"])
        self.assertEqual(self.task_count(), 0)

    def test_context_expiry_during_readback_rolls_back_task_and_never_verifies(self):
        from dataclasses import replace
        from backend.app.agent_tools import TOOLS
        _, headers = self.context_agent(require_approval=False)
        run = self.graph(headers)
        claim = claim_next_agent_action(self.database, self.settings)
        with self.database.session_factory() as session:
            expiry = aware(session.get(ContextRecord, self.record["id"]).expires_at)
        definition = TOOLS[("workspace.context_tasks.create", "1")]
        # Advance only the retention clock during the real task verifier. This
        # isolates source expiry from the independently tested run/lease fences.
        with patch("backend.app.service_domains.agent_generalization.utcnow", return_value=utcnow()) as source_clock:
            def expire_after_readback(*args):
                verified = definition.check_completion(*args)
                self.assertTrue(verified)
                source_clock.return_value = expiry
                return verified
            with patch.dict(TOOLS, {("workspace.context_tasks.create", "1"):
                    replace(definition, check_completion=expire_after_readback)}):
                self.assertFalse(self.process(claim))
        self.assertEqual(self.task_count(), 0)
        final = self.read(headers, run)
        self.assertEqual(final["status"], "failed")
        self.assertFalse(final["result"]["verified"])

    def test_forged_status_or_unrelated_verified_receipt_cannot_complete_a_node(self):
        _, headers = self.context_agent(require_approval=False)
        for index, result in enumerate(({}, {"verified": True, "type": "unrelated_business_goal", "due_at": self.due})):
            with self.subTest(result=result):
                run = self.graph(headers, self.graph_payload(idempotency_key=f"forged-{index}"))
                action = self.actions(headers, run)["follow-up"]
                with self.database.session_factory() as session:
                    record = session.get(AgentAction, action["id"])
                    record.status, record.result_json = "succeeded", json.dumps(result)
                    session.commit()
                recover_workflow_graphs(self.database, self.settings, self.store)
                self.assertEqual(self.read(headers, run)["status"], "failed")
                self.assertEqual(self.read(headers, run)["error_code"], "invalid_completion_receipt")
                self.assertEqual(self.task_count(), 0)

    def test_recovery_rejects_correct_shaped_receipts_with_wrong_exact_bindings(self):
        _, headers = self.context_agent(require_approval=False)
        for index, mutation in enumerate(({"task_id": "foreign-task"}, {"version_id": "foreign-version"},
                {"evidence_id": "foreign-evidence"}, {"node_id": "child"}, {"plan_sha256": "0" * 64},
                {"due_at": (utcnow() + timedelta(days=100)).isoformat()}, {"contract_id": "foreign-contract"})):
            with self.subTest(mutation=mutation):
                run = self.graph(headers, self.graph_payload(idempotency_key=f"binding-{index}", nodes=[
                    self.node("parent"), self.node("child", depends_on=["parent"],
                        not_before_at=(utcnow() + timedelta(minutes=20)).isoformat())]))
                action = self.actions(headers, run)["parent"]
                self.assertTrue(self.process(claim_next_agent_action(self.database, self.settings)))
                with self.database.session_factory() as session:
                    record = session.get(AgentAction, action["id"])
                    receipt = json.loads(record.result_json)
                    self.assertIs(receipt["verified"], True)
                    receipt.update(mutation)
                    record.result_json = json.dumps(receipt)
                    # Exercise restart recovery of a receipt/checkpoint discrepancy.
                    session.get(WorkflowGraphNode, (run["id"], "parent")).status = "ready"
                    session.commit()
                recover_workflow_graphs(self.database, self.settings, self.store)
                final = self.read(headers, run)
                self.assertEqual(final["status"], "failed")
                self.assertEqual(final["error_code"], "invalid_completion_receipt")
                self.assertFalse(final["result"]["verified"])
                self.assertEqual(final["result"]["completed_nodes"], {})
                self.assertEqual(self.task_count(), index + 1)

    def test_failed_false_branch_preserves_already_verified_partial_progress(self):
        second = self.create_record()
        _, headers = self.agent(contract_ids=[], context_ids=[self.record["id"], second["id"]],
            allowed_tools=["context.retrieve", "workspace.context_tasks.create"], max_actions_per_run=2)
        child = self.node("child", depends_on=["parent"], when={"fact": "needed", "value": False, "equals": True})
        child["task"]["context_id"] = second["id"]
        run = self.graph(headers, self.graph_payload(context_ids=[self.record["id"], second["id"]],
            nodes=[self.node("parent"), child]))
        actions = self.actions(headers, run)
        for action in actions.values():
            self.assertEqual(self.approve(run["id"], action["id"]).status_code, 200)
        self.assertEqual(self.client.post(self.base + "/context-records/" + second["id"] + "/versions",
            headers=self.alice, json={"expected_version": 1, "text": self.text + " revised"}).status_code, 201)
        self.assertTrue(self.process(claim_next_agent_action(self.database, self.settings)))
        final = self.read(headers, run)
        self.assertEqual(final["status"], "failed")
        self.assertFalse(final["result"]["verified"])
        self.assertEqual(set(final["result"]["completed_nodes"]), {"parent"})
        self.assertEqual(final["result"]["skipped_node_ids"], [])
        self.assertEqual(self.task_count(), 1)


class GeneralizationMigrationTests(unittest.TestCase):
    def test_additive_upgrade_preserves_v1_data_and_schema_matches(self):
        with tempfile.TemporaryDirectory() as temporary:
            settings = Settings(_env_file=None, environment="test", auth_mode="local", auto_create_schema=False,
                database_url=f"sqlite:///{Path(temporary) / 'migrated.db'}")
            database = Database(settings)
            config = Config("backend/alembic.ini")
            with patch("backend.app.config.get_settings", return_value=settings), database.engine.begin() as connection:
                config.attributes["connection"] = connection
                command.upgrade(config, "ab3d5e7f9012")
                # Save a real legacy grant/run; new defaults must be backfilled.
                from backend.app.models import Organization, User
                from sqlalchemy.orm import Session
                with Session(connection) as session:
                    user = User(id="legacy-user", external_subject="legacy", email="legacy@example.com", display_name="Legacy")
                    org = Organization(id="legacy-org", name="Legacy", slug="legacy")
                    session.add_all([user, org])
                    session.flush()
                    # Raw legacy columns intentionally exclude new scope fields.
                    from sqlalchemy import text
                    session.execute(text("INSERT INTO agent_principals (id, organization_id, delegated_by_user_id, name, token_hash, token_prefix, allowed_tools_json, contract_ids_json, assignee_ids_json, calendar_targets_json, require_approval, max_actions_per_run, expires_at, revision, created_at) VALUES ('legacy-agent', 'legacy-org', 'legacy-user', 'Legacy', :hash, 'legacy', '[]', '[]', '[]', '[]', TRUE, 1, :expires, 0, :now)"),
                        {"hash": "1" * 64, "expires": utcnow() + timedelta(days=1), "now": utcnow()})
                    session.flush()
                    session.commit()
                command.upgrade(config, "head")
                self.assertEqual(compare_metadata(MigrationContext.configure(connection), Base.metadata), [])
                self.assertEqual(connection.execute(text("SELECT context_ids_json FROM agent_principals WHERE id='legacy-agent'")).scalar(), "[]")
                command.downgrade(config, "ab3d5e7f9012")
                self.assertEqual(connection.execute(text("SELECT name FROM organizations WHERE id='legacy-org'")).scalar(), "Legacy")
                command.upgrade(config, "head")
            database.dispose()


if __name__ == "__main__":
    unittest.main()
