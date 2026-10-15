"""Organization-private context and bounded, approval-bound workflow graphs."""
from collections import Counter, deque
from datetime import datetime, timedelta
import re

from fastapi import HTTPException
from sqlalchemy import func, select, update

from ..agent_generalization_models import ContextEvidence, ContextRecord, ContextVersion, WorkflowGraph, WorkflowGraphNode
from ..agent_generalization_schemas import (
    ContextEvidenceResponse, ContextRecordResponse, ContextSearch, ContextSearchHit, ContextVersionResponse,
    GraphNodeResponse, GraphResponse, WorkflowGraphCreate,
)
from ..agent_models import AgentAction, AgentEvidence, AgentRun
from ..agent_schemas import ContextTaskActionInput, ContextTaskCondition
from ..models import utcnow
from .agents import TERMINAL_RUN_STATES, canonical_json, digest
from .common import aware, json_dump, json_load


def lexical_window(text, query):
    """Minimum original-offset window covering all distinct query word terms."""
    terms = {m.group().casefold() for m in re.finditer(r"\w+", query)}
    if not 1 <= len(terms) <= 10:
        raise HTTPException(422, "Search requires 1–10 distinct word terms.")
    window, counts, best = deque(), Counter(), None
    for match in re.finditer(r"\w+", text):
        term = match.group().casefold()
        if term not in terms:
            continue
        window.append((term, match.start(), match.end()))
        counts[term] += 1
        while len(counts) == len(terms):
            span = (window[-1][2] - window[0][1], window[0][1], window[-1][2])
            if best is None or span < best:
                best = span
            first, _, _ = window.popleft()
            counts[first] -= 1
            if not counts[first]:
                del counts[first]
    if best is None or best[0] > 3400:
        return None
    return best[0], max(0, best[1] - 300), min(len(text), best[2] + 300)


class AgentGeneralizationServiceMixin:
    def _scope_context(self, organization_id, context_id):
        # UPDATE also takes the SQLite write lock. All execution paths take the
        # principal/run first; source-only mutations never acquire those locks.
        changed = self.session.execute(update(ContextRecord).where(
            ContextRecord.id == context_id, ContextRecord.organization_id == organization_id,
        ).values(revision=ContextRecord.revision + 1).execution_options(synchronize_session=False)).rowcount
        if not changed:
            raise HTTPException(404, "Scoped context record not found.")
        record = self.session.get(ContextRecord, context_id, populate_existing=True)
        if record.deleted_at or aware(record.expires_at) <= utcnow():
            raise HTTPException(409, "Context source is deleted or expired.")
        return record

    @staticmethod
    def context_record_response(record):
        return ContextRecordResponse(id=record.id, organization_id=record.organization_id,
            title=record.title, current_version=record.current_version, expires_at=aware(record.expires_at),
            deleted_at=aware(record.deleted_at) if record.deleted_at else None, created_at=aware(record.created_at))

    def create_context_record(self, organization_id, user, payload):
        self.workspace.require_roles(organization_id, user, {"owner", "admin"}, "Only owners/admins may write context.")
        if not utcnow() < payload.expires_at <= utcnow() + timedelta(days=365):
            raise HTTPException(422, "Context retention must end within the next 365 days.")
        record = ContextRecord(organization_id=organization_id, title=payload.title, expires_at=payload.expires_at)
        self.session.add(record)
        self.session.flush()
        self.session.add(ContextVersion(record_id=record.id, version_number=1,
            text=payload.text, source_sha256=digest(payload.text)))
        self._audit(organization_id, user.id, "context.created", detail={"context_id": record.id})
        self.session.commit()
        return self.context_record_response(record)

    def list_context_records(self, organization_id, user, limit=50):
        self.workspace.membership(organization_id, user)
        return [self.context_record_response(r) for r in self.session.scalars(select(ContextRecord).where(
            ContextRecord.organization_id == organization_id, ContextRecord.deleted_at.is_(None),
            ContextRecord.expires_at > utcnow()).order_by(ContextRecord.created_at.desc(), ContextRecord.id).limit(limit))]

    def get_context_record(self, organization_id, context_id, user):
        self.workspace.membership(organization_id, user)
        return self.context_record_response(self._scope_context(organization_id, context_id))

    def create_context_version(self, organization_id, context_id, user, payload):
        self.workspace.require_roles(organization_id, user, {"owner", "admin"}, "Only owners/admins may write context.")
        record = self._scope_context(organization_id, context_id)
        if payload.expected_version != record.current_version:
            raise HTTPException(409, "Context version changed; reload before appending.")
        record.current_version += 1
        self.session.add(ContextVersion(record_id=record.id, version_number=record.current_version,
            text=payload.text, source_sha256=digest(payload.text)))
        self._audit(organization_id, user.id, "context.version_created", detail={
            "context_id": record.id, "version_number": record.current_version})
        self.session.commit()
        return self.context_record_response(record)

    def read_context_version(self, organization_id, context_id, version_number, user):
        self.workspace.membership(organization_id, user)
        self._scope_context(organization_id, context_id)
        version = self.session.scalar(select(ContextVersion).where(
            ContextVersion.version_number == version_number, ContextVersion.record_id == context_id))
        if version is None or version.text is None:
            raise HTTPException(404, "Retained context version not found.")
        return ContextVersionResponse(id=version.id, record_id=context_id, version_number=version.version_number,
            source_sha256=version.source_sha256, text=version.text, created_at=aware(version.created_at))

    def delete_context_record(self, organization_id, context_id, user):
        self.workspace.require_roles(organization_id, user, {"owner", "admin"}, "Only owners/admins may delete context.")
        record = self.session.scalar(select(ContextRecord).where(
            ContextRecord.id == context_id, ContextRecord.organization_id == organization_id).with_for_update())
        if record is None:
            raise HTTPException(404, "Context record not found.")
        # Acquire a write lock even for expired/already-deleted records.
        self.session.execute(update(ContextRecord).where(ContextRecord.id == record.id).values(
            revision=ContextRecord.revision + 1, deleted_at=record.deleted_at or utcnow()))
        self.session.execute(update(ContextVersion).where(ContextVersion.record_id == record.id).values(text=None))
        self._audit(organization_id, user.id, "context.deleted", detail={"context_id": record.id})
        self.session.commit()

    def narrow_context_scope(self, organization_id, agent_id, user, payload):
        self.workspace.require_roles(organization_id, user, {"owner", "admin"}, "Only owners/admins may narrow delegation.")
        from ..agent_models import AgentPrincipal
        agent = self.session.scalar(select(AgentPrincipal).where(
            AgentPrincipal.id == agent_id, AgentPrincipal.organization_id == organization_id))
        if agent is None:
            raise HTTPException(404, "Agent not found.")
        agent = self._lock_agent(agent.id)
        if not set(payload.context_ids) <= set(json_load(agent.context_ids_json, [])):
            raise HTTPException(403, "Context scope may only be narrowed.")
        agent.context_ids_json = canonical_json(payload.context_ids)
        for item in self.session.scalars(select(AgentRun).where(AgentRun.agent_id == agent.id,
                AgentRun.status.not_in(TERMINAL_RUN_STATES)).order_by(AgentRun.id)):
            if not set(json_load(item.context_ids_json, [])) <= set(payload.context_ids):
                self._end_run(self._lock_run(item.id), "failed", "delegation_denied")
        self._audit(organization_id, user.id, "agent.context_scope_narrowed", detail={"agent_id": agent.id})
        self.session.commit()
        return self.agent_response(agent)

    @staticmethod
    def _context_scope(agent, run, context_ids, tool="context.retrieve"):
        for grant in (agent, run):
            if tool not in json_load(grant.allowed_tools_json, []):
                raise HTTPException(403, "Context tool exceeds delegation.")
            if not set(context_ids) <= set(json_load(grant.context_ids_json, [])):
                raise HTTPException(403, "Context resources exceed explicit scope.")

    def retrieve_context_evidence(self, agent, run_id, payload: ContextSearch, *, commit=True):
        agent, run = self._mutating_agent_run(agent, run_id)
        self._context_scope(agent, run, payload.context_ids)
        count = sum(self.session.scalar(select(func.count()).select_from(model).where(model.run_id == run.id))
                    for model in (ContextEvidence, AgentEvidence))
        remaining = self.settings.agent_max_evidence_receipts_per_run - count
        if remaining <= 0:
            raise HTTPException(409, "The run evidence receipt budget is exhausted.")
        matches = self._search_context_versions(run.organization_id, payload)
        results = []
        for _, context_id, start, end, version in matches[:min(remaining, payload.max_results)]:
            receipt = ContextEvidence(run_id=run.id, context_id=context_id, version_id=version.id,
                source_sha256=version.source_sha256, start_offset=start, end_offset=end)
            self.session.add(receipt)
            self.session.flush()
            self._event(run, "context.evidence_retrieved", {"evidence_id": receipt.id,
                "context_id": context_id, "version_id": version.id, "source_sha256": version.source_sha256})
            results.append(self._context_evidence_response(receipt, version.text))
        self.session.commit() if commit else self.session.flush()
        return results

    def _search_context_versions(self, organization_id, payload):
        matches = []
        for context_id in sorted(payload.context_ids):
            record = self._scope_context(organization_id, context_id)
            version = self.session.scalar(select(ContextVersion).where(ContextVersion.record_id == context_id,
                ContextVersion.version_number == record.current_version))
            if version is None or version.text is None or digest(version.text) != version.source_sha256:
                raise HTTPException(409, "Retained context is unavailable or has an invalid hash.")
            span = lexical_window(version.text, payload.query)
            if span:
                matches.append((span[0], context_id, span[1], span[2], version))
        if not matches:
            raise HTTPException(404, "No retained context window matches all search terms.")
        return sorted(matches, key=lambda m: (m[0], m[1]))

    def search_delegated_context(self, agent, payload):
        agent = self._lock_agent(agent.id)
        self._agent_is_active(agent, lock_authority=True)
        self._context_scope(agent, agent, payload.context_ids)
        hits = [ContextSearchHit(context_id=context_id, version_id=version.id,
            source_sha256=version.source_sha256, start_offset=start, end_offset=end, excerpt=version.text[start:end])
            for _, context_id, start, end, version in self._search_context_versions(
                agent.organization_id, payload)[:payload.max_results]]
        self.session.commit()
        return hits

    @staticmethod
    def _context_evidence_response(receipt, text):
        return ContextEvidenceResponse(id=receipt.id, context_id=receipt.context_id, version_id=receipt.version_id,
            source_sha256=receipt.source_sha256, start_offset=receipt.start_offset, end_offset=receipt.end_offset,
            excerpt=text[receipt.start_offset:receipt.end_offset], created_at=aware(receipt.created_at))

    def _retained_context_evidence(self, run, evidence_id, *, latest=False):
        receipt = self.session.scalar(select(ContextEvidence).where(
            ContextEvidence.id == evidence_id, ContextEvidence.run_id == run.id))
        if receipt is None:
            raise HTTPException(404, "Context evidence not found.")
        record = self._scope_context(run.organization_id, receipt.context_id)
        version = self.session.scalar(select(ContextVersion).where(
            ContextVersion.id == receipt.version_id, ContextVersion.record_id == record.id))
        if (version is None or version.text is None or digest(version.text) != receipt.source_sha256
                or version.source_sha256 != receipt.source_sha256
                or not 0 <= receipt.start_offset < receipt.end_offset <= len(version.text)
                or (latest and version.version_number != record.current_version)):
            raise HTTPException(409, "Context evidence is stale or no longer retained.")
        return receipt, version

    def read_context_evidence(self, run, evidence_id, *, agent=None):
        if agent:
            # Authentication may predate a committed revoke/scope narrowing.
            # Serialize the read with grant changes, without requiring a live run:
            # retained historical evidence remains readable under a current grant.
            agent = self._lock_agent(agent.id)
            self._agent_is_active(agent, lock_authority=True)
            run = self._lock_run(run.id)
        receipt, version = self._retained_context_evidence(run, evidence_id)
        if agent:
            self._context_scope(agent, run, [receipt.context_id])
        return self._context_evidence_response(receipt, version.text)

    def create_workflow_graph(self, agent, payload: WorkflowGraphCreate):
        agent = self._lock_agent(agent.id)
        self._agent_is_active(agent, lock_authority=True)
        plan_json = canonical_json(payload.model_dump(mode="json"))
        plan_hash = digest(plan_json)
        existing = self.session.scalar(select(AgentRun).where(AgentRun.agent_id == agent.id,
            AgentRun.idempotency_key == payload.idempotency_key))
        if existing:
            if existing.request_sha256 != plan_hash or self.session.get(WorkflowGraph, existing.id) is None:
                raise HTTPException(409, "Run key already binds a different immutable plan.")
            self.session.commit()
            return existing
        tools = {"context.retrieve", "workspace.context_tasks.create"}
        if not tools <= set(json_load(agent.allowed_tools_json, [])):
            raise HTTPException(403, "Graph tools exceed delegation.")
        if not set(payload.context_ids) <= set(json_load(agent.context_ids_json, [])):
            raise HTTPException(403, "Graph context exceeds delegation.")
        if len(payload.nodes) > agent.max_actions_per_run:
            raise HTTPException(403, "Graph exceeds the delegated action budget.")
        now = utcnow()
        if not now < payload.deadline_at <= min(aware(agent.expires_at), now + timedelta(days=29)):
            raise HTTPException(422, "Graph deadline must be future, within delegation and at most 29 days.")
        for context_id in sorted(payload.context_ids):
            record = self._scope_context(agent.organization_id, context_id)
            if payload.deadline_at > aware(record.expires_at):
                raise HTTPException(422, "Graph deadline exceeds context retention.")
        if any(n.when for n in payload.nodes) and not agent.require_approval:
            raise HTTPException(422, "Factual branches require human action approval.")
        for node in payload.nodes:
            if node.task.context_id not in payload.context_ids or node.task.assigned_to_user_id not in json_load(agent.assignee_ids_json, []):
                raise HTTPException(403, "Node target or assignee exceeds explicit scope.")
            self._scope_assignee(agent.organization_id, node.task.assigned_to_user_id)
            not_before = node.not_before_at or now
            if not_before >= payload.deadline_at:
                raise HTTPException(422, "Not-before must precede the graph deadline.")
            if agent.require_approval and not_before >= min(payload.deadline_at, now + timedelta(hours=1)):
                raise HTTPException(422, "Scheduled execution would outlive the immutable approval window.")
        success = {"type": "graph", "nodes": [{"id": n.id,
            "condition": n.task.model_dump(mode="json", exclude={"query"})} for n in payload.nodes]}
        run = AgentRun(organization_id=agent.organization_id, agent_id=agent.id,
            idempotency_key=payload.idempotency_key, request_sha256=plan_hash, goal=payload.goal,
            contract_ids_json="[]", context_ids_json=canonical_json(payload.context_ids),
            allowed_tools_json=canonical_json(sorted(tools)), success_condition_json=canonical_json(success),
            max_actions=len(payload.nodes), deadline_at=payload.deadline_at, created_at=now, updated_at=now)
        self.session.add(run)
        self.session.flush()
        self.session.add(WorkflowGraph(run_id=run.id, plan_json=plan_json, plan_sha256=plan_hash))
        self.session.flush()
        self._event(run, "run.created", {"execution_owner": "external_agent"})
        for node in payload.nodes:
            evidence = self.retrieve_context_evidence(agent, run.id,
                ContextSearch(context_ids=[node.task.context_id], query=node.task.query, max_results=1), commit=False)[0]
            # Retrieval relocks/reloads the run. Never retain a stale sequence.
            run = self.session.get(AgentRun, run.id)
            invocation = ContextTaskActionInput(**node.task.model_dump(exclude={"query"}),
                condition_id=node.id, evidence_id=evidence.id, plan_sha256=plan_hash, when=node.when)
            serialized = canonical_json(invocation.model_dump(mode="json"))
            action = AgentAction(run_id=run.id, idempotency_key="graph:" + node.id,
                tool="workspace.context_tasks.create", input_json=serialized, input_sha256=digest(serialized),
                status="awaiting_approval" if agent.require_approval else "queued",
                approval_status="pending" if agent.require_approval else "not_required",
                approval_expires_at=min(payload.deadline_at, now + timedelta(hours=1)) if agent.require_approval else None)
            self.session.add(action)
            self.session.flush()
            self.session.add(WorkflowGraphNode(run_id=run.id, node_id=node.id, action_id=action.id,
                depends_on_json=canonical_json(node.depends_on), not_before_at=node.not_before_at or now))
            self._event(run, "action.proposed", {"action_id": action.id, "tool": action.tool,
                "input_sha256": action.input_sha256, "status": action.status})
        self.session.flush()
        self._event(run, "graph.created", {"plan_sha256": plan_hash, "node_ids": [n.id for n in payload.nodes]})
        self.advance_workflow_graph(agent, run)
        self._audit(agent.organization_id, agent.delegated_by_user_id, "agent.graph_created", detail={"run_id": run.id})
        self.session.commit()
        return run

    def validate_context_task_input(self, agent, run, payload):
        self._context_scope(agent, run, [payload.context_id], "workspace.context_tasks.create")
        self._context_scope(agent, run, [payload.context_id])
        if payload.assigned_to_user_id not in json_load(agent.assignee_ids_json, []):
            raise HTTPException(403, "Assignee exceeds delegation.")
        self._scope_assignee(run.organization_id, payload.assigned_to_user_id)
        graph = self.session.get(WorkflowGraph, run.id)
        node = self.session.get(WorkflowGraphNode, (run.id, payload.condition_id))
        if graph is None or node is None or digest(graph.plan_json) != graph.plan_sha256 or payload.plan_sha256 != graph.plan_sha256:
            raise HTTPException(409, "Immutable graph binding is invalid.")
        plan = WorkflowGraphCreate.model_validate_json(graph.plan_json)
        expected_success = {"type": "graph", "nodes": [{"id": n.id,
            "condition": n.task.model_dump(mode="json", exclude={"query"})} for n in plan.nodes]}
        if (run.request_sha256 != graph.plan_sha256 or run.goal != plan.goal
                or aware(run.deadline_at) != plan.deadline_at or run.max_actions != len(plan.nodes)
                or json_load(run.context_ids_json, []) != plan.context_ids
                or json_load(run.success_condition_json, {}) != expected_success):
            raise HTTPException(409, "Run scope or success conditions no longer match the immutable plan.")
        expected = next((n for n in plan.nodes if n.id == node.node_id), None)
        condition = ContextTaskCondition.model_validate(payload.model_dump(exclude={"condition_id", "evidence_id", "plan_sha256", "when"}))
        if (expected is None or condition.model_dump() != expected.task.model_dump(exclude={"query"})
                or payload.when != expected.when or json_load(node.depends_on_json, []) != expected.depends_on
                or aware(node.not_before_at) != (expected.not_before_at or aware(run.created_at))):
            raise HTTPException(409, "Node invocation no longer matches its immutable plan.")
        receipt, _ = self._retained_context_evidence(run, payload.evidence_id, latest=True)
        if receipt.context_id != payload.context_id:
            raise HTTPException(422, "Evidence must belong to this run and context target.")
        return receipt

    def workflow_graph_response(self, run):
        graph = self.session.get(WorkflowGraph, run.id)
        if graph is None:
            raise HTTPException(404, "Workflow graph not found.")
        return GraphResponse(run_id=run.id, plan_sha256=graph.plan_sha256, nodes=[
            GraphNodeResponse(id=n.node_id, action_id=n.action_id, depends_on=json_load(n.depends_on_json, []),
                not_before_at=aware(n.not_before_at), status=n.status)
            for n in self.session.scalars(select(WorkflowGraphNode).where(
                WorkflowGraphNode.run_id == run.id).order_by(WorkflowGraphNode.node_id))])

    def advance_workflow_graph(self, agent, run):
        """Only under principal/run locks; receipts and skips commit atomically."""
        if run.status in TERMINAL_RUN_STATES:
            return
        self.session.flush()
        nodes = {n.node_id: n for n in self.session.scalars(select(WorkflowGraphNode).where(WorkflowGraphNode.run_id == run.id))}
        actions = {a.id: a for a in self.session.scalars(select(AgentAction).where(AgentAction.run_id == run.id))}
        changed = False
        for node in nodes.values():
            action = actions[node.action_id]
            if action.status == "succeeded":
                if not self._verified_graph_receipt(run, node, action):
                    action.status, action.error_code = "failed", "invalid_completion_receipt"
                    node.status = "blocked"
                    self._checkpoint_graph_progress(run, nodes, actions, emit=changed)
                    self._event(run, "action.failed", {"action_id": action.id, "error_code": action.error_code})
                    self._end_run(run, "failed", action.error_code)
                    return
                if node.status != "completed":
                    node.status, changed = "completed", True
        # At most 20 passes; no wait/sleep/polling. This handles false chains even
        # when nodes were submitted in reverse dependency order.
        for _ in range(len(nodes)):
            progressed = False
            for node in nodes.values():
                action = actions[node.action_id]
                if node.status != "blocked" or action.status != "queued":
                    continue
                if any(nodes[d].status not in {"completed", "skipped"} for d in json_load(node.depends_on_json, [])):
                    continue
                payload = ContextTaskActionInput.model_validate_json(action.input_json)
                if payload.when and payload.when.value != payload.when.equals:
                    try:
                        self._run_is_live(run)
                        self._agent_is_active(agent, lock_authority=True)
                        self.validate_context_task_input(agent, run, payload)
                        from ..agent_generalization_runtime import validate_context_approval
                        validate_context_approval(self.session, agent, run, action)
                    except HTTPException:
                        self._checkpoint_graph_progress(run, nodes, actions, emit=changed)
                        self._end_run(run, "failed", "evidence_or_policy_expired")
                        return
                    node.status = "skipped"
                    # Skipped is not a verified action success/effect.
                    action.status, action.error_code, action.completed_at = "cancelled", "branch_false", utcnow()
                    self._event(run, "graph.node_skipped", {"node_id": node.node_id, "action_id": action.id})
                else:
                    node.status = "ready"
                    self._event(run, "graph.node_ready", {"node_id": node.node_id, "action_id": action.id})
                progressed = changed = True
            if not progressed:
                break
        verified = self._checkpoint_graph_progress(run, nodes, actions, emit=changed)
        if verified:
            self._end_run(run, "succeeded", "")
        else:
            self.session.flush()
            self.refresh_agent_run_status(run)

    def _checkpoint_graph_progress(self, run, nodes, actions, *, emit):
        completed = {n.node_id: {"action_id": n.action_id, "result": json_load(actions[n.action_id].result_json, {})}
                     for n in nodes.values() if n.status == "completed"}
        skipped = sorted(n.node_id for n in nodes.values() if n.status == "skipped")
        verified = len(completed) + len(skipped) == len(nodes)
        run.result_json = json_dump({"type": "graph", "verified": verified,
            "completed_nodes": completed, "skipped_node_ids": skipped})
        if emit:
            self._event(run, "graph.checkpoint", {"completed_node_ids": sorted(completed), "skipped_node_ids": skipped})
        return verified

    def _verified_graph_receipt(self, run, node, action):
        """A status/verified flag alone cannot satisfy an exact node condition.

        Check historical receipt bindings, not today's mutable task/source state.
        Source freshness and database read-back were enforced at effect commit.
        """
        graph = self.session.get(WorkflowGraph, run.id)
        if (graph is None or digest(graph.plan_json) != graph.plan_sha256
                or run.request_sha256 != graph.plan_sha256 or digest(action.input_json) != action.input_sha256
                or action.tool != "workspace.context_tasks.create" or action.tool_version != "1"):
            return False
        try:
            payload = ContextTaskActionInput.model_validate_json(action.input_json)
            plan = WorkflowGraphCreate.model_validate_json(graph.plan_json)
            expected = next(n for n in plan.nodes if n.id == node.node_id)
            receipt = json_load(action.result_json, {})
            if not isinstance(receipt, dict):
                return False
            due = datetime.fromisoformat(receipt["due_at"])
            evidence = self.session.get(ContextEvidence, payload.evidence_id)
            return (payload.condition_id == node.node_id and payload.plan_sha256 == graph.plan_sha256
                and payload.model_dump(exclude={"condition_id", "evidence_id", "plan_sha256", "when"})
                    == expected.task.model_dump(exclude={"query"}) and payload.when == expected.when
                and receipt.get("verified") is True and receipt.get("type") == "context_task_created"
                and receipt.get("verification_method") == "database_read_back"
                and receipt.get("task_id") == action.output_id and receipt.get("contract_id") is None
                and receipt.get("node_id") == node.node_id and receipt.get("plan_sha256") == graph.plan_sha256
                and receipt.get("context_id") == payload.context_id
                and receipt.get("assigned_to_user_id") == payload.assigned_to_user_id
                and due.tzinfo is not None and due == payload.due_at
                and receipt.get("evidence_id") == payload.evidence_id and evidence is not None
                and evidence.run_id == run.id and evidence.context_id == payload.context_id
                and receipt.get("version_id") == evidence.version_id)
        except (ValueError, TypeError, KeyError, StopIteration):
            return False
