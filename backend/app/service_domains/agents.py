"""Agent delegation, bounded runs, evidence receipts, and immutable actions.

All mutations lock the principal before the run. Updates acquire row locks on
PostgreSQL and the write lock on SQLite, including during revoke/cancel/dispatch.
The action row doubles as the transactional dispatch outbox.
"""
from __future__ import annotations

import hashlib
import json
import re
import secrets
from datetime import timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select, update

from ..agent_models import AgentAction, AgentEvidence, AgentInputRequest, AgentPrincipal, AgentRun, AgentRunEvent
from ..agent_schemas import (
    AgentActionCreate, AgentActionResponse, AgentCreate, AgentCreatedResponse,
    AgentEventResponse, AgentResponse, AgentRunCreate, AgentRunResponse,
    ApprovalDecision, EvidenceRequest, EvidenceResponse, TaskActionInput, ToolResponse,
    CalendarActionInput, InputRequestCreate, InputRequestResponse, InputSupply, WorkflowCreate,
)
from ..agent_tools import TOOLS, conditions, get_tool, selected_condition
from ..agent_resources import CalendarResource
from ..models import Contract, ContractVersion, Membership, User, utcnow
from .common import aware, json_dump, json_load, normalized_role


TERMINAL_RUN_STATES = {"succeeded", "failed", "cancelled"}
LIVE_ACTION_STATES = {"queued", "running", "awaiting_approval"}


def canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class AgentsServiceMixin:
    def _lock_agent(self, agent_id: str) -> AgentPrincipal:
        changed = self.session.execute(
            update(AgentPrincipal).where(AgentPrincipal.id == agent_id)
            .values(revision=AgentPrincipal.revision + 1)
            .execution_options(synchronize_session=False)
        ).rowcount
        if not changed:
            raise HTTPException(status_code=404, detail="Agent not found.")
        agent = self.session.get(AgentPrincipal, agent_id, populate_existing=True)
        return agent

    def _lock_run(self, run_id: str) -> AgentRun:
        changed = self.session.execute(
            update(AgentRun).where(AgentRun.id == run_id)
            .values(revision=AgentRun.revision + 1)
            .execution_options(synchronize_session=False)
        ).rowcount
        if not changed:
            raise HTTPException(status_code=404, detail="Run not found.")
        return self.session.get(AgentRun, run_id, populate_existing=True)

    def _agent_is_active(self, agent: AgentPrincipal, *, lock_authority: bool = False) -> None:
        if agent.revoked_at is not None or aware(agent.expires_at) <= utcnow():
            raise HTTPException(status_code=401, detail="The agent credential is revoked or expired.")
        query = select(Membership).where(
            Membership.organization_id == agent.organization_id,
            Membership.user_id == agent.delegated_by_user_id,
        )
        membership = self.session.scalar(query.with_for_update() if lock_authority else query)
        if membership is None or normalized_role(membership.role) not in {"owner", "admin"}:
            raise HTTPException(status_code=403, detail="The delegating user no longer has agent administration access.")

    def authenticate_agent(self, token: str) -> AgentPrincipal:
        if not token.startswith("ll_agent_") or len(token) > 256:
            raise HTTPException(status_code=401, detail="A valid agent bearer credential is required.")
        agent = self.session.scalar(select(AgentPrincipal).where(AgentPrincipal.token_hash == digest(token)))
        if agent is None:
            raise HTTPException(status_code=401, detail="A valid agent bearer credential is required.")
        self._agent_is_active(agent)
        return agent

    def _scope_contract(self, organization_id: str, contract_id: str) -> Contract:
        contract = self.session.scalar(select(Contract).where(
            Contract.id == contract_id, Contract.organization_id == organization_id,
        ).with_for_update())
        if contract is None:
            raise HTTPException(status_code=404, detail="A scoped contract is unavailable.")
        if contract.expires_at is not None and aware(contract.expires_at) <= utcnow():
            raise HTTPException(status_code=409, detail="A scoped contract has expired.")
        return contract

    def _scope_assignee(self, organization_id: str, user_id: str) -> None:
        membership = self.session.scalar(select(Membership).where(
            Membership.organization_id == organization_id, Membership.user_id == user_id,
        ).with_for_update())
        if membership is None:
            raise HTTPException(status_code=422, detail="The assignee must belong to the workspace.")

    def create_agent(self, organization_id: str, user: User, payload: AgentCreate, *,
                     internal: bool = False, commit: bool = True) -> AgentCreatedResponse | AgentPrincipal:
        self.workspace.require_roles(organization_id, user, {"owner", "admin"},
                                     "Only owners and administrators can delegate to agents.")
        if payload.expires_at <= utcnow() or payload.expires_at > utcnow() + timedelta(days=365):
            raise HTTPException(status_code=422, detail="Agent expiry must be within the next 365 days.")
        for contract_id in sorted(payload.contract_ids):
            self._scope_contract(organization_id, contract_id)
        for assignee_id in sorted(payload.assignee_ids):
            self._scope_assignee(organization_id, assignee_id)
        targets = [target.model_dump() for target in payload.calendar_targets]
        if len({canonical_json(t) for t in targets}) != len(targets):
            raise HTTPException(422, "Calendar grants must be unique.")
        for target in sorted(payload.calendar_targets, key=lambda t: (t.connection_id, t.calendar_id)):
            CalendarResource(target.connection_id, target.calendar_id).authorize(self, organization_id)
        if not payload.contract_ids and not targets:
            raise HTTPException(422, "Delegate at least one explicit contract or calendar resource.")
        # Internal grants have no usable bearer and expose only an opaque marker.
        token = secrets.token_urlsafe(32) if internal else "ll_agent_" + secrets.token_urlsafe(32)
        agent = AgentPrincipal(
            organization_id=organization_id, delegated_by_user_id=user.id, name=payload.name,
            token_hash=digest(token), token_prefix="internal" if internal else token[:18],
            allowed_tools_json=canonical_json(payload.allowed_tools),
            contract_ids_json=canonical_json(payload.contract_ids),
            assignee_ids_json=canonical_json(payload.assignee_ids),
            calendar_targets_json=canonical_json(targets),
            require_approval=payload.require_approval, max_actions_per_run=payload.max_actions_per_run,
            expires_at=payload.expires_at,
        )
        self.session.add(agent)
        self.session.flush()
        self._audit(organization_id, user.id, "agent.created", detail={"agent_id": agent.id})
        self.session.commit() if commit else self.session.flush()
        if internal:
            return agent
        return AgentCreatedResponse(agent=self.agent_response(agent), token=token)

    def list_agents(self, organization_id: str, user: User) -> list[AgentPrincipal]:
        self.workspace.require_roles(organization_id, user, {"owner", "admin"},
                                     "Only owners and administrators can view agent delegations.")
        return list(self.session.scalars(select(AgentPrincipal).where(
            AgentPrincipal.organization_id == organization_id,
        ).order_by(AgentPrincipal.created_at.desc())).all())

    def revoke_agent(self, organization_id: str, agent_id: str, user: User) -> AgentPrincipal:
        self.workspace.require_roles(organization_id, user, {"owner", "admin"},
                                     "Only owners and administrators can revoke agents.")
        agent = self.session.scalar(select(AgentPrincipal).where(
            AgentPrincipal.id == agent_id, AgentPrincipal.organization_id == organization_id,
        ))
        if agent is None:
            raise HTTPException(status_code=404, detail="Agent not found.")
        agent = self._lock_agent(agent.id)
        if agent.revoked_at is None:
            agent.revoked_at = utcnow()
            runs = list(self.session.scalars(select(AgentRun).where(
                AgentRun.agent_id == agent.id, AgentRun.status.not_in(TERMINAL_RUN_STATES),
            )).all())
            for item in runs:
                run = self._lock_run(item.id)
                self._end_run(run, "cancelled", "agent_revoked")
            self._audit(organization_id, user.id, "agent.revoked", detail={"agent_id": agent.id})
        self.session.commit()
        return agent

    @staticmethod
    def agent_response(agent: AgentPrincipal) -> AgentResponse:
        status = "revoked" if agent.revoked_at else "expired" if aware(agent.expires_at) <= utcnow() else "active"
        return AgentResponse(
            id=agent.id, organization_id=agent.organization_id, delegated_by_user_id=agent.delegated_by_user_id,
            name=agent.name, token_prefix=agent.token_prefix, allowed_tools=json_load(agent.allowed_tools_json, []),
            contract_ids=json_load(agent.contract_ids_json, []), assignee_ids=json_load(agent.assignee_ids_json, []),
            calendar_targets=json_load(agent.calendar_targets_json, []),
            require_approval=agent.require_approval, max_actions_per_run=agent.max_actions_per_run,
            status=status, expires_at=aware(agent.expires_at), revoked_at=aware(agent.revoked_at) if agent.revoked_at else None,
            created_at=aware(agent.created_at),
        )

    def agent_tools(self, agent: AgentPrincipal) -> list[ToolResponse]:
        tools = {definition.name: ToolResponse(name=definition.name, version=definition.version,
                 description=definition.description, requires_approval=definition.writes and agent.require_approval,
                 input_schema=definition.input_model.model_json_schema()) for definition in TOOLS.values()}
        return [tools[name] for name in json_load(agent.allowed_tools_json, []) if name in tools]

    def _event(self, run: AgentRun, event_type: str, data: dict | None = None) -> None:
        run.event_sequence += 1
        run.updated_at = utcnow()
        self.session.add(AgentRunEvent(run_id=run.id, sequence=run.event_sequence,
                                      type=event_type, data_json=json_dump(data or {})))

    def create_agent_run(self, agent: AgentPrincipal, payload: AgentRunCreate, *, commit: bool = True,
                         execution_owner: str = "external_agent") -> AgentRun:
        agent = self._lock_agent(agent.id)
        self._agent_is_active(agent, lock_authority=True)
        request_input = payload.model_dump(mode="json")
        if not request_input.get("calendar_targets"):
            request_input.pop("calendar_targets", None)
        serialized = canonical_json(request_input)
        request_hash = digest(serialized)
        existing = self.session.scalar(select(AgentRun).where(
            AgentRun.agent_id == agent.id, AgentRun.idempotency_key == payload.idempotency_key,
        ))
        if existing is not None:
            if existing.request_sha256 != request_hash:
                raise HTTPException(status_code=409, detail="The run idempotency key already binds different input.")
            self.session.commit() if commit else self.session.flush()
            return existing
        if not set(payload.contract_ids) <= set(json_load(agent.contract_ids_json, [])):
            raise HTTPException(status_code=403, detail="Run resources exceed the agent delegation.")
        if not set(payload.allowed_tools) <= set(json_load(agent.allowed_tools_json, [])):
            raise HTTPException(status_code=403, detail="Run tools exceed the agent delegation.")
        required_conditions = conditions(payload.success_condition.model_dump(mode="json"))
        required_tools = set()
        for item in required_conditions.values():
            required_tools.add("workspace.tasks.create" if item["type"] == "workspace_task_created" else "google_calendar.events.create")
            if item["type"] == "workspace_task_created":
                required_tools.add("documents.retrieve")
        if not required_tools <= set(payload.allowed_tools):
            raise HTTPException(status_code=422, detail="The workflow requires retrieval and all completion tools.")
        if len(required_conditions) > payload.max_actions:
            raise HTTPException(422, "Action budget cannot satisfy all required conditions.")
        if payload.max_actions > agent.max_actions_per_run:
            raise HTTPException(status_code=403, detail="Run action budget exceeds the agent delegation.")
        if not utcnow() < payload.deadline_at <= aware(agent.expires_at):
            raise HTTPException(status_code=422, detail="Run deadline must be in the future and within agent expiry.")
        targets = [t.model_dump() for t in getattr(payload, "calendar_targets", [])]
        for target in sorted(targets, key=canonical_json):
            CalendarResource(**target).authorize(self, agent.organization_id, json_load(agent.calendar_targets_json, []))
        for condition in required_conditions.values():
            if condition["type"] == "workspace_task_created":
                if condition["contract_id"] not in payload.contract_ids or condition["assigned_to_user_id"] not in json_load(agent.assignee_ids_json, []):
                    raise HTTPException(status_code=403, detail="The success condition exceeds delegated resources or assignees.")
                self._scope_assignee(agent.organization_id, condition["assigned_to_user_id"])
            else:
                CalendarResource(condition["connection_id"], condition["calendar_id"]).authorize(
                    self, agent.organization_id, targets, json_load(agent.calendar_targets_json, []))
        for contract_id in sorted(payload.contract_ids):
            self._scope_contract(agent.organization_id, contract_id)
        run = AgentRun(
            organization_id=agent.organization_id, agent_id=agent.id, idempotency_key=payload.idempotency_key,
            request_sha256=request_hash, goal=payload.goal, contract_ids_json=canonical_json(payload.contract_ids),
            allowed_tools_json=canonical_json(payload.allowed_tools),
            success_condition_json=canonical_json(payload.success_condition.model_dump(mode="json")),
            calendar_targets_json=canonical_json(targets),
            max_actions=payload.max_actions, deadline_at=payload.deadline_at, execution_owner=execution_owner,
        )
        self.session.add(run)
        self.session.flush()
        self._event(run, "run.created", {"execution_owner": execution_owner})
        self._audit(agent.organization_id, agent.delegated_by_user_id, "agent.run_created", detail={"agent_id": agent.id, "run_id": run.id})
        self.session.commit() if commit else self.session.flush()
        return run

    def get_agent_run(self, run_id: str, *, agent: AgentPrincipal | None = None,
                      organization_id: str | None = None, user: User | None = None) -> AgentRun:
        query = select(AgentRun).where(AgentRun.id == run_id)
        if agent is not None:
            query = query.where(AgentRun.agent_id == agent.id, AgentRun.organization_id == agent.organization_id)
        else:
            self.workspace.membership(organization_id, user)
            query = query.where(AgentRun.organization_id == organization_id)
        run = self.session.scalar(query)
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found.")
        return run

    def list_agent_runs(self, *, agent: AgentPrincipal | None = None,
                        organization_id: str | None = None, user: User | None = None, limit: int = 50) -> list[AgentRun]:
        query = select(AgentRun)
        if agent is not None:
            query = query.where(AgentRun.agent_id == agent.id, AgentRun.organization_id == agent.organization_id)
        else:
            self.workspace.membership(organization_id, user)
            query = query.where(AgentRun.organization_id == organization_id)
        return list(self.session.scalars(query.order_by(AgentRun.created_at.desc(), AgentRun.id).limit(limit)).all())

    @staticmethod
    def agent_run_response(run: AgentRun) -> AgentRunResponse:
        return AgentRunResponse(
            id=run.id, organization_id=run.organization_id, agent_id=run.agent_id, idempotency_key=run.idempotency_key,
            goal=run.goal, contract_ids=json_load(run.contract_ids_json, []), allowed_tools=json_load(run.allowed_tools_json, []),
            execution_owner=run.execution_owner,
            max_actions=run.max_actions, status=run.status, success_condition=json_load(run.success_condition_json, {}),
            calendar_targets=json_load(run.calendar_targets_json, []),
            result=json_load(run.result_json, {}), error_code=run.error_code, deadline_at=aware(run.deadline_at),
            created_at=aware(run.created_at), updated_at=aware(run.updated_at),
            completed_at=aware(run.completed_at) if run.completed_at else None,
        )

    def _mutating_agent_run(self, agent: AgentPrincipal, run_id: str) -> tuple[AgentPrincipal, AgentRun]:
        self.get_agent_run(run_id, agent=agent)
        agent = self._lock_agent(agent.id)
        self._agent_is_active(agent, lock_authority=True)
        run = self._lock_run(run_id)
        self._run_is_live(run)
        return agent, run

    @staticmethod
    def _run_is_live(run: AgentRun) -> None:
        if run.status in TERMINAL_RUN_STATES:
            raise HTTPException(status_code=409, detail="The run has already finished.")
        if aware(run.deadline_at) <= utcnow():
            raise HTTPException(status_code=409, detail="The run deadline has elapsed.")

    def _source_version(self, organization_id: str, contract_id: str, version_id: str | None = None) -> ContractVersion:
        contract = self._scope_contract(organization_id, contract_id)
        if not contract.retain_source_text:
            raise HTTPException(status_code=409, detail="Evidence retrieval requires retained source text.")
        query = select(ContractVersion).where(
            ContractVersion.organization_id == organization_id, ContractVersion.contract_id == contract_id,
        )
        if version_id is not None:
            query = query.where(ContractVersion.id == version_id)
        version = self.session.scalar(query.order_by(ContractVersion.version_number.desc()).limit(1).with_for_update())
        if version is None or not version.extracted_text:
            raise HTTPException(status_code=409, detail="The selected document version has no retained source text.")
        return version

    def retrieve_agent_evidence(self, agent: AgentPrincipal, run_id: str, payload: EvidenceRequest, *, commit: bool = True) -> EvidenceResponse:
        agent, run = self._mutating_agent_run(agent, run_id)
        if "documents.retrieve" not in json_load(run.allowed_tools_json, []):
            raise HTTPException(status_code=403, detail="Retrieval is outside the run tool scope.")
        if payload.contract_id not in json_load(run.contract_ids_json, []) or payload.contract_id not in json_load(agent.contract_ids_json, []):
            raise HTTPException(status_code=403, detail="Retrieval is outside the delegated resource scope.")
        evidence_count = self.session.scalar(select(func.count()).select_from(AgentEvidence).where(AgentEvidence.run_id == run.id))
        if evidence_count >= self.settings.agent_max_evidence_receipts_per_run:
            raise HTTPException(status_code=409, detail="The run evidence receipt budget is exhausted.")
        version = self._source_version(run.organization_id, payload.contract_id, payload.version_id)
        text = version.extracted_text
        # Match against slices of the original string so unicode case folding
        # cannot shift the offsets stored in the receipt.
        match = re.search(re.escape(payload.query), text, re.IGNORECASE)
        if match is None:
            raise HTTPException(status_code=404, detail="No source excerpt matches the query. Try a shorter phrase.")
        start = max(0, match.start() - 300)
        end = min(len(text), match.end() + 700)
        evidence = AgentEvidence(
            run_id=run.id, contract_id=payload.contract_id, version_id=version.id,
            source_sha256=digest(text), start_offset=start, end_offset=end,
        )
        self.session.add(evidence)
        self.session.flush()
        self._event(run, "evidence.retrieved", {
            "evidence_id": evidence.id, "contract_id": evidence.contract_id,
            "version_id": evidence.version_id, "source_sha256": evidence.source_sha256,
        })
        self.session.commit() if commit else self.session.flush()
        return EvidenceResponse(
            id=evidence.id, contract_id=evidence.contract_id, version_id=evidence.version_id,
            source_sha256=evidence.source_sha256, excerpt=text[start:end], start_offset=start,
            end_offset=end, created_at=aware(evidence.created_at),
        )

    def validate_agent_task_input(self, agent: AgentPrincipal, run: AgentRun, payload: TaskActionInput) -> AgentEvidence:
        if "workspace.tasks.create" not in json_load(agent.allowed_tools_json, []) or "workspace.tasks.create" not in json_load(run.allowed_tools_json, []):
            raise HTTPException(status_code=403, detail="Task creation is outside the tool scope.")
        if payload.contract_id not in json_load(run.contract_ids_json, []) or payload.contract_id not in json_load(agent.contract_ids_json, []):
            raise HTTPException(status_code=403, detail="Task target is outside the resource scope.")
        if payload.assigned_to_user_id not in json_load(agent.assignee_ids_json, []):
            raise HTTPException(status_code=403, detail="Task assignee is outside the delegation.")
        condition = selected_condition(run, payload)
        if condition.get("type") != "workspace_task_created":
            raise HTTPException(422, "The selected condition requires a different tool.")
        # Compare timezone-aware instants, not differently formatted date strings.
        from ..agent_schemas import TaskSuccessCondition
        success = TaskSuccessCondition.model_validate(condition)
        if (payload.contract_id != success.contract_id or payload.assigned_to_user_id != success.assigned_to_user_id
                or payload.due_at != success.due_at):
            raise HTTPException(status_code=422, detail="Task input must satisfy the run's exact success condition.")
        self._scope_assignee(run.organization_id, payload.assigned_to_user_id)
        evidence = self.session.scalar(select(AgentEvidence).where(
            AgentEvidence.id == payload.evidence_id, AgentEvidence.run_id == run.id,
            AgentEvidence.contract_id == payload.contract_id,
        ))
        if evidence is None:
            raise HTTPException(status_code=422, detail="Use an evidence receipt from this run and contract.")
        version = self._source_version(run.organization_id, payload.contract_id, evidence.version_id)
        latest = self.session.scalar(select(ContractVersion.id).where(
            ContractVersion.contract_id == payload.contract_id, ContractVersion.organization_id == run.organization_id,
        ).order_by(ContractVersion.version_number.desc()).limit(1))
        if version.id != latest or digest(version.extracted_text) != evidence.source_sha256:
            raise HTTPException(status_code=409, detail="Source evidence is stale. Retrieve the current document version.")
        if not 0 <= evidence.start_offset < evidence.end_offset <= len(version.extracted_text):
            raise HTTPException(status_code=409, detail="The evidence receipt is invalid.")
        if payload.deadline_basis is not None:
            calculated = payload.deadline_basis.renewal_date - timedelta(days=payload.deadline_basis.notice_days)
            if payload.due_at.astimezone(timezone.utc).date() != calculated:
                raise HTTPException(status_code=422, detail="The due date does not match the supplied renewal date and notice period.")
        return evidence

    def validate_agent_calendar_input(self, agent, run, payload: CalendarActionInput):
        if any("google_calendar.events.create" not in json_load(item.allowed_tools_json, []) for item in (agent, run)):
            raise HTTPException(403, "Calendar tool is outside delegation.")
        CalendarResource(payload.connection_id, payload.calendar_id).authorize(
            self, run.organization_id, json_load(agent.calendar_targets_json, []), json_load(run.calendar_targets_json, []))
        condition = selected_condition(run, payload)
        from ..agent_schemas import CalendarSuccessCondition
        if condition.get("type") != "calendar_event_created":
            raise HTTPException(422, "The selected condition requires a different tool.")
        expected = CalendarSuccessCondition.model_validate(condition)
        if any(getattr(payload, name) != getattr(expected, name) for name in ("connection_id", "calendar_id", "summary", "start_at", "end_at")):
            raise HTTPException(422, "Calendar input must match the exact success condition.")
        if payload.contract_id is None:
            return None
        if any("documents.retrieve" not in json_load(item.allowed_tools_json, []) for item in (agent, run)):
            raise HTTPException(403, "Document provenance is outside the retrieval scope.")
        if any(payload.contract_id not in json_load(item.contract_ids_json, []) for item in (agent, run)):
            raise HTTPException(403, "Source is outside delegation.")
        evidence = self.session.scalar(select(AgentEvidence).where(
            AgentEvidence.id == payload.evidence_id, AgentEvidence.run_id == run.id,
            AgentEvidence.contract_id == payload.contract_id))
        if evidence is None:
            raise HTTPException(422, "Use evidence from this run and contract.")
        self.read_agent_evidence(run, evidence.id)
        latest = self._source_version(run.organization_id, payload.contract_id)
        if evidence.version_id != latest.id:
            raise HTTPException(409, "Source evidence is stale.")
        return evidence

    def checkpoint_agent_action(self, run, action, result):
        """Immutable verified receipts form the durable composite checkpoint."""
        condition = json_load(run.success_condition_json, {})
        if condition["type"] != "all":
            run.result_json = json_dump(result)
            self._end_run(run, "succeeded", "")
            return
        self.session.flush()
        completed = {}
        for item in self.session.scalars(select(AgentAction).where(AgentAction.run_id == run.id, AgentAction.status == "succeeded")):
            receipt = json_load(item.result_json, {})
            key = json_load(item.input_json, {}).get("condition_id")
            if receipt.get("verified") and key in conditions(condition):
                completed[key] = {"action_id": item.id, "result": receipt}
        run.result_json = json_dump({"type": "all", "verified": len(completed) == len(condition["conditions"]),
                                     "completed_conditions": completed})
        self._event(run, "run.checkpoint", {"completed_condition_ids": sorted(completed)})
        if len(completed) == len(condition["conditions"]):
            self._end_run(run, "succeeded", "")
        else:
            self.refresh_agent_run_status(run)

    def refresh_agent_run_status(self, run):
        pending = self.session.scalar(select(AgentInputRequest.id).where(
            AgentInputRequest.run_id == run.id, AgentInputRequest.supplied_at.is_(None)).limit(1))
        approval = self.session.scalar(select(AgentAction.id).where(
            AgentAction.run_id == run.id, AgentAction.status == "awaiting_approval").limit(1))
        run.status = "awaiting_input" if pending else "awaiting_approval" if approval else "running"

    def request_agent_input(self, agent, run_id, payload: InputRequestCreate, *, commit: bool = True):
        agent, run = self._mutating_agent_run(agent, run_id)
        serialized = canonical_json(payload.model_dump(mode="json"))
        existing = self.session.scalar(select(AgentInputRequest).where(
            AgentInputRequest.run_id == run.id, AgentInputRequest.idempotency_key == payload.idempotency_key))
        if existing:
            if existing.request_json != serialized:
                raise HTTPException(409, "Input key already binds a different request.")
            self.session.commit() if commit else self.session.flush()
            return self.agent_input_response(existing)
        count = self.session.scalar(select(func.count()).select_from(AgentInputRequest).where(AgentInputRequest.run_id == run.id))
        if count >= 20 or run.status == "awaiting_input":
            raise HTTPException(409, "Input request budget exhausted or a request is already pending.")
        if self.session.scalar(select(AgentAction.id).where(AgentAction.run_id == run.id, AgentAction.status.in_(LIVE_ACTION_STATES)).limit(1)):
            raise HTTPException(409, "Input waits cannot alter or suspend an already proposed action.")
        if not utcnow() < payload.expires_at <= aware(run.deadline_at):
            raise HTTPException(422, "Input expiry must be future and bounded by the run deadline.")
        record = AgentInputRequest(run_id=run.id, idempotency_key=payload.idempotency_key,
                                   request_json=serialized, expires_at=payload.expires_at)
        self.session.add(record)
        self.session.flush()
        run.status = "awaiting_input"
        self._event(run, "input.requested", {"input_request_id": record.id, "responder": payload.responder})
        self.session.commit() if commit else self.session.flush()
        return self.agent_input_response(record)

    def list_agent_inputs(self, run):
        return [self.agent_input_response(r) for r in self.session.scalars(select(AgentInputRequest).where(
            AgentInputRequest.run_id == run.id).order_by(AgentInputRequest.created_at, AgentInputRequest.id))]

    @staticmethod
    def agent_input_response(record):
        request = InputRequestCreate.model_validate_json(record.request_json)
        return InputRequestResponse(id=record.id, run_id=record.run_id, request=request,
            status="supplied" if record.supplied_at else "expired" if request.expires_at <= utcnow() else "pending",
            values=json_load(record.values_json, {}), supplied_by_user_id=record.supplied_by_user_id,
            supplied_by_agent_id=record.supplied_by_agent_id,
            supplied_at=aware(record.supplied_at) if record.supplied_at else None, created_at=aware(record.created_at))

    def supply_agent_input(self, run_id, request_id, payload: InputSupply, *, agent=None, organization_id=None, user=None):
        run = self.get_agent_run(run_id, agent=agent, organization_id=organization_id, user=user)
        if user is not None:
            self.workspace.require_roles(organization_id, user, {"owner", "admin"}, "Only owners/admins may supply human input.")
        principal = self._lock_agent(run.agent_id)
        self._agent_is_active(principal, lock_authority=True)
        run = self._lock_run(run.id)
        record = self.session.scalar(select(AgentInputRequest).where(
            AgentInputRequest.id == request_id, AgentInputRequest.run_id == run.id))
        if record is None:
            raise HTTPException(404, "Input request not found.")
        request = InputRequestCreate.model_validate_json(record.request_json)
        if (agent is None) != (request.responder == "human"):
            raise HTTPException(403, "This request requires the designated responder type.")
        if set(payload.values) != {f.name for f in request.fields}:
            raise HTTPException(422, "Supply exactly the requested fields.")
        values = dict(payload.values)
        from pydantic import TypeAdapter, AwareDatetime, ValidationError
        for field in request.fields:
            value = values[field.name]
            valid = {"text": type(value) is str and len(value) <= 4000,
                     "integer": type(value) is int and -(2**31) <= value < 2**31,
                     "boolean": type(value) is bool, "date_time": type(value) is str}[field.type]
            if not valid:
                raise HTTPException(422, "Supplied value does not match the requested type or bound.")
            if field.type == "date_time":
                try:
                    values[field.name] = TypeAdapter(AwareDatetime).validate_python(value).astimezone(timezone.utc).isoformat()
                except ValidationError:
                    raise HTTPException(422, "Date-time input requires an explicit timezone.") from None
        serialized = canonical_json(values)
        if record.supplied_at:
            if record.values_json != serialized:
                raise HTTPException(409, "Supplied input is immutable.")
            self.session.commit()
            return self.agent_input_response(record)
        self._run_is_live(run)
        if request.expires_at <= utcnow():
            raise HTTPException(409, "Input request expired; create a new run.")
        record.values_json, record.supplied_at = serialized, utcnow()
        record.supplied_by_user_id = user.id if user else None
        record.supplied_by_agent_id = agent.id if agent else None
        self.session.flush()
        self.refresh_agent_run_status(run)
        self._event(run, "input.supplied", {"input_request_id": record.id, "responder": request.responder})
        self.session.commit()
        return self.agent_input_response(record)

    def read_agent_evidence(self, run: AgentRun, evidence_id: str) -> EvidenceResponse:
        evidence = self.session.scalar(select(AgentEvidence).where(
            AgentEvidence.id == evidence_id, AgentEvidence.run_id == run.id,
        ))
        if evidence is None:
            raise HTTPException(status_code=404, detail="Evidence not found.")
        version = self._source_version(run.organization_id, evidence.contract_id, evidence.version_id)
        text = version.extracted_text
        if digest(text) != evidence.source_sha256 or not 0 <= evidence.start_offset < evidence.end_offset <= len(text):
            raise HTTPException(status_code=409, detail="The retained source no longer matches this evidence receipt.")
        return EvidenceResponse(
            id=evidence.id, contract_id=evidence.contract_id, version_id=evidence.version_id,
            source_sha256=evidence.source_sha256, excerpt=text[evidence.start_offset:evidence.end_offset],
            start_offset=evidence.start_offset, end_offset=evidence.end_offset, created_at=aware(evidence.created_at),
        )

    def propose_agent_action(self, agent: AgentPrincipal, run_id: str, payload: AgentActionCreate, *, commit: bool = True) -> AgentAction:
        self.get_agent_run(run_id, agent=agent)
        agent = self._lock_agent(agent.id)
        self._agent_is_active(agent, lock_authority=True)
        run = self._lock_run(run_id)
        action_input = payload.input.model_dump(mode="json")
        if action_input.get("condition_id") is None:
            action_input.pop("condition_id", None)  # preserve hashes of pre-migration v1 invocations
        serialized = canonical_json(action_input)
        input_hash = digest(serialized)
        existing = self.session.scalar(select(AgentAction).where(
            AgentAction.run_id == run.id, AgentAction.idempotency_key == payload.idempotency_key,
        ))
        if existing is not None:
            if existing.input_sha256 != input_hash or existing.tool != payload.tool:
                raise HTTPException(status_code=409, detail="The action idempotency key already binds different input.")
            self.session.commit() if commit else self.session.flush()
            return existing
        self._run_is_live(run)
        if run.status == "awaiting_input":
            raise HTTPException(409, "Supply the requested input before proposing new actions.")
        count = self.session.scalar(select(func.count()).select_from(AgentAction).where(AgentAction.run_id == run.id))
        if count >= run.max_actions:
            raise HTTPException(status_code=409, detail="The run action budget is exhausted.")
        definition = get_tool(payload.tool, getattr(payload, "tool_version", "1"))
        definition.validate_scope(self, agent, run, payload.input)
        key = payload.input.condition_id or "__single__"
        for prior in self.session.scalars(select(AgentAction).where(AgentAction.run_id == run.id)):
            if (json_load(prior.input_json, {}).get("condition_id") or "__single__") == key:
                raise HTTPException(409, "A required condition already has an immutable action.")
        approval_expiry = min(aware(run.deadline_at), utcnow() + timedelta(hours=1)) if agent.require_approval else None
        action = AgentAction(
            run_id=run.id, idempotency_key=payload.idempotency_key, tool=payload.tool,
            input_json=serialized, input_sha256=input_hash,
            status="awaiting_approval" if agent.require_approval else "queued",
            approval_status="pending" if agent.require_approval else "not_required",
            approval_expires_at=approval_expiry,
        )
        self.session.add(action)
        self.session.flush()
        run.status = "awaiting_approval" if agent.require_approval else "running"
        self._event(run, "action.proposed", {
            "action_id": action.id, "tool": action.tool, "input_sha256": input_hash, "status": action.status,
        })
        self._audit(run.organization_id, agent.delegated_by_user_id, "agent.action_proposed", detail={
            "run_id": run.id, "agent_id": agent.id, "action_id": action.id, "input_sha256": input_hash,
        })
        self.session.commit() if commit else self.session.flush()
        return action

    def approve_agent_action(self, organization_id: str, run_id: str, action_id: str,
                             user: User, payload: ApprovalDecision) -> AgentAction:
        self.workspace.require_roles(organization_id, user, {"owner", "admin"},
                                     "Only owners and administrators can approve agent actions.")
        run = self.get_agent_run(run_id, organization_id=organization_id, user=user)
        agent = self._lock_agent(run.agent_id)
        self._agent_is_active(agent, lock_authority=True)
        run = self._lock_run(run.id)
        self._run_is_live(run)
        action = self.session.scalar(select(AgentAction).where(AgentAction.id == action_id, AgentAction.run_id == run.id))
        if action is None:
            raise HTTPException(status_code=404, detail="Action not found.")
        if action.approval_status != "pending" or action.status != "awaiting_approval":
            raise HTTPException(status_code=409, detail="This action is not awaiting approval.")
        if action.approval_expires_at is None or aware(action.approval_expires_at) <= utcnow():
            raise HTTPException(status_code=409, detail="The action approval window has expired.")
        if digest(action.input_json) != action.input_sha256:
            raise HTTPException(status_code=409, detail="The action input binding is invalid.")
        definition = get_tool(action.tool, action.tool_version)
        definition.validate_scope(self, agent, run, definition.input_model.model_validate_json(action.input_json))
        action.approval_status = payload.decision
        action.approved_by_user_id = user.id
        action.approval_reason = payload.reason
        action.approved_input_sha256 = action.input_sha256 if payload.decision == "approved" else None
        self._event(run, "action." + payload.decision, {"action_id": action.id, "approved_by_user_id": user.id})
        if payload.decision == "approved":
            action.status = "queued"
            self.session.flush()
            self.refresh_agent_run_status(run)
        else:
            action.status = "cancelled"
            action.error_code = "approval_rejected"
            action.completed_at = utcnow()
            self._end_run(run, "failed", "approval_rejected")
        self._audit(organization_id, user.id, "agent.action_" + payload.decision, detail={
            "action_id": action.id, "run_id": run.id, "input_sha256": action.input_sha256,
        })
        self.session.commit()
        return action

    def _end_run(self, run: AgentRun, status: str, error_code: str) -> None:
        run.status, run.error_code, run.completed_at = status, error_code, utcnow()
        self.session.execute(update(AgentAction).where(
            AgentAction.run_id == run.id, AgentAction.status.in_(LIVE_ACTION_STATES),
            # An external write already dispatched cannot be rolled back. Keep
            # its lease for fenced receipt/recovery; cancellation blocks new I/O.
            ~and_(AgentAction.tool == "google_calendar.events.create", AgentAction.status == "running",
                  AgentAction.dispatch_started_at.is_not(None)),
        ).values(status="cancelled", error_code=error_code, completed_at=utcnow(),
                 lease_token=None, lease_expires_at=None))
        self._event(run, "run." + status, {"error_code": error_code})

    def reconcile_calendar_action(self, organization_id, run_id, action_id, user):
        self.workspace.require_roles(organization_id, user, {"owner", "admin"}, "Only owners/admins may request reconciliation.")
        run = self.get_agent_run(run_id, organization_id=organization_id, user=user)
        agent = self._lock_agent(run.agent_id)
        self._agent_is_active(agent, lock_authority=True)
        run = self._lock_run(run.id)
        action = self.session.scalar(select(AgentAction).where(AgentAction.id == action_id, AgentAction.run_id == run.id).with_for_update())
        if action is None:
            raise HTTPException(404, "Action not found.")
        if action.tool != "google_calendar.events.create" or action.status != "unknown_outcome" or action.dispatch_started_at is None:
            raise HTTPException(409, "Only an uncertain dispatched calendar action can be reconciled.")
        if action.attempts >= self.settings.agent_action_max_attempts:
            raise HTTPException(409, "Reconciliation attempt budget exhausted; investigate the stable provider ID.")
        definition = get_tool(action.tool, action.tool_version)
        definition.validate_scope(self, agent, run, definition.input_model.model_validate_json(action.input_json))
        action.status, action.error_code, action.completed_at = "queued", "", None
        self._event(run, "action.reconciliation_requested", {"action_id": action.id})
        self._audit(organization_id, user.id, "calendar.reconciliation_requested", detail={"run_id": run.id, "action_id": action.id})
        self.session.commit()
        return action

    def cancel_agent_run(self, run_id: str, *, agent: AgentPrincipal | None = None,
                         organization_id: str | None = None, user: User | None = None) -> AgentRun:
        run = self.get_agent_run(run_id, agent=agent, organization_id=organization_id, user=user)
        if agent is None:
            self.workspace.require_roles(organization_id, user, {"owner", "admin"},
                                         "Only owners and administrators can cancel agent runs.")
        principal = self._lock_agent(run.agent_id)
        if agent is not None:
            self._agent_is_active(principal, lock_authority=True)
        run = self._lock_run(run.id)
        if run.status not in TERMINAL_RUN_STATES:
            self._end_run(run, "cancelled", "cancelled_by_operator" if agent is None else "cancelled_by_agent")
            self._audit(run.organization_id, user.id if user else principal.delegated_by_user_id,
                        "agent.run_cancelled", detail={"run_id": run.id, "agent_id": principal.id})
        self.session.commit()
        return run

    def agent_run_events(self, run: AgentRun, after_sequence: int = 0, limit: int = 100) -> list[AgentEventResponse]:
        events = self.session.scalars(select(AgentRunEvent).where(
            AgentRunEvent.run_id == run.id, AgentRunEvent.sequence > after_sequence,
        ).order_by(AgentRunEvent.sequence).limit(limit)).all()
        return [AgentEventResponse(id=item.id, run_id=item.run_id, sequence=item.sequence,
                                  type=item.type, data=json_load(item.data_json, {}), created_at=aware(item.created_at)) for item in events]

    def agent_run_actions(self, run: AgentRun) -> list[AgentActionResponse]:
        actions = self.session.scalars(select(AgentAction).where(AgentAction.run_id == run.id).order_by(AgentAction.created_at, AgentAction.id)).all()
        return [self.agent_action_response(item) for item in actions]

    @staticmethod
    def agent_action_response(action: AgentAction) -> AgentActionResponse:
        return AgentActionResponse(
            id=action.id, run_id=action.run_id, idempotency_key=action.idempotency_key, tool=action.tool,
            tool_version=action.tool_version, input=get_tool(action.tool, action.tool_version).input_model.model_validate_json(action.input_json),
            input_sha256=action.input_sha256, status=action.status, attempts=action.attempts,
            approval_status=action.approval_status, approved_by_user_id=action.approved_by_user_id,
            approval_reason=action.approval_reason,
            approval_expires_at=aware(action.approval_expires_at) if action.approval_expires_at else None,
            result=json_load(action.result_json, {}), error_code=action.error_code,
            created_at=aware(action.created_at), updated_at=aware(action.updated_at),
            completed_at=aware(action.completed_at) if action.completed_at else None,
        )
