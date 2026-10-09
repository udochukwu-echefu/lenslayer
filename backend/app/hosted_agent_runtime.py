"""Restartable bounded planner. All effects use the original immutable ledger.

Each pure planning step and checkpoint share a transaction/final lease fence.
Model calls charge once in a committed checkpoint and run without DB locks.
"""
from datetime import timedelta

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import and_, case, or_, select, update

from .agent_models import AgentAction, AgentInputRequest, AgentRun
from .agent_resources import CalendarResource
from .agent_schemas import EvidenceRequest, InputRequestCreate
from .hosted_agent_models import HostedAgentTask
from .hosted_agent_plan import delegation, proposal, workflow
from .hosted_agent_schemas import HostedTaskCreate
from .hosted_agent_service import TERMINAL_RUN_STATES, model_available
from .models import Membership, User, new_id, utcnow
from .service_domains.agents import canonical_json, digest
from .service_domains.common import aware, json_load, normalized_role
from .services import PlatformService
from . import hosted_agent_model

WAIT_PHASES = {"observe", "confirm_input"}


class HostedLeaseLost(Exception):
    pass


class HostedPolicyError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def claim_next_hosted_task(database, settings):
    now = utcnow()
    eligible = and_(HostedAgentTask.status.not_in(TERMINAL_RUN_STATES), HostedAgentTask.next_attempt_at <= now,
        or_(HostedAgentTask.lease_token.is_(None), HostedAgentTask.lease_expires_at <= now))
    with database.session_factory() as session:
        query = select(HostedAgentTask.id, HostedAgentTask.revision).where(eligible).order_by(
            HostedAgentTask.next_attempt_at, HostedAgentTask.created_at, HostedAgentTask.id).limit(10)
        if database.engine.dialect.name == "postgresql":
            query = query.with_for_update(skip_locked=True)
        candidates = session.execute(query).all()
        for task_id, revision in candidates:
            token = new_id()
            changed = session.execute(update(HostedAgentTask).where(
                HostedAgentTask.id == task_id, HostedAgentTask.revision == revision, eligible).values(
                    lease_token=token, lease_expires_at=now + timedelta(seconds=settings.hosted_agent_lease_seconds),
                    revision=HostedAgentTask.revision + 1,
                    status=case((HostedAgentTask.status == "queued", "planning"), else_=HostedAgentTask.status),
                    attempts=HostedAgentTask.attempts + case((or_(HostedAgentTask.phase.in_(WAIT_PHASES),
                        HostedAgentTask.status.in_(["awaiting_input", "awaiting_approval", "running"])), 0), else_=1))
                .execution_options(synchronize_session=False)).rowcount
            if changed:
                session.commit()
                return task_id, token
        session.rollback()
    return None


def _locked(session, task_id, token):
    changed = session.execute(update(HostedAgentTask).where(
        HostedAgentTask.id == task_id, HostedAgentTask.lease_token == token,
        HostedAgentTask.lease_expires_at > utcnow(), HostedAgentTask.status.not_in(TERMINAL_RUN_STATES))
        .values(revision=HostedAgentTask.revision + 1).execution_options(synchronize_session=False)).rowcount
    if not changed:
        raise HostedLeaseLost()
    return session.get(HostedAgentTask, task_id, populate_existing=True)


def _fence_commit(session, task, token, *, release=True):
    with session.no_autoflush:
        changed = session.execute(update(HostedAgentTask).where(
            HostedAgentTask.id == task.id, HostedAgentTask.lease_token == token,
            HostedAgentTask.lease_expires_at > utcnow()).values(revision=HostedAgentTask.revision + 1)
            .execution_options(synchronize_session=False)).rowcount
    if not changed:
        raise HostedLeaseLost()
    if release:
        task.lease_token = task.lease_expires_at = None
    task.updated_at = utcnow()
    session.commit()


def _request(task):
    if digest(task.request_json) != task.request_sha256:
        raise HostedPolicyError("request_binding_changed")
    request = HostedTaskCreate.model_validate_json(task.request_json)
    if (request.goal_type != task.goal_type or request.goal != task.goal or request.planner_mode != task.planner_mode
            or request.deadline_at != aware(task.deadline_at)):
        raise HostedPolicyError("request_binding_changed")
    return request


def _run_matches(task, request, run):
    expected = workflow(request)
    values = expected.model_dump(mode="json")
    if not values.get("calendar_targets"):
        values.pop("calendar_targets", None)
    return (run.id == task.run_id and run.agent_id == task.agent_id and run.organization_id == task.organization_id
        and run.execution_owner == "lenslayer_hosted_agent" and run.request_sha256 == digest(canonical_json(values))
        and run.goal == request.goal and aware(run.deadline_at) == request.deadline_at
        and run.max_actions == expected.max_actions and json_load(run.contract_ids_json, []) == expected.contract_ids
        and json_load(run.allowed_tools_json, []) == expected.allowed_tools
        and json_load(run.calendar_targets_json, []) == [t.model_dump() for t in expected.calendar_targets]
        and json_load(run.success_condition_json, {}) == expected.success_condition.model_dump(mode="json"))


def verified_completion(service, task, run):
    """Matching immutable run plus all server-verified immutable action receipts."""
    try:
        request = _request(task)
        if not _run_matches(task, request, run) or run.status != "succeeded" or not json_load(run.result_json, {}).get("verified"):
            return False
        if not run.completed_at or aware(run.completed_at) > request.deadline_at:
            return False
        kinds = (["task"] if request.contract_id else []) + (["calendar"] if request.calendar else [])
        actions = service.session.scalars(select(AgentAction).where(AgentAction.run_id == run.id)).all()
        if len(actions) != len(kinds):
            return False
        for kind in kinds:
            expected = proposal(request, kind, task.evidence_id)
            payload = expected.input.model_dump(mode="json")
            if payload.get("condition_id") is None:
                payload.pop("condition_id", None)
            item = next((a for a in actions if a.idempotency_key == expected.idempotency_key), None)
            if (not item or item.status != "succeeded" or item.tool != expected.tool or item.tool_version != "1"
                    or item.approval_status != "approved" or item.approved_input_sha256 != item.input_sha256
                    or item.input_json != canonical_json(payload) or digest(item.input_json) != item.input_sha256
                    or not json_load(item.result_json, {}).get("verified")):
                return False
        return True
    except (HostedPolicyError, ValidationError, ValueError):
        return False


def _context(service, task, request):
    agent = service._lock_agent(task.agent_id) if task.agent_id else None
    run = service._lock_run(task.run_id) if task.run_id else None
    if task.phase != "initialize" and (agent is None or run is None):
        raise HostedPolicyError("checkpoint_missing")
    if run and not _run_matches(task, request, run):
        raise HostedPolicyError("run_binding_changed")
    # Terminal verified outcomes are historical receipts; observation does not
    # dispatch. Do not turn a timely success into failure merely due to poll lag.
    if run and run.status in TERMINAL_RUN_STATES:
        return agent, run
    if not service.settings.hosted_agents_enabled:
        raise HostedPolicyError("hosted_disabled")
    if request.deadline_at <= utcnow():
        raise HostedPolicyError("deadline_exceeded")
    member = service.session.scalar(select(Membership).where(
        Membership.organization_id == task.organization_id, Membership.user_id == task.created_by_user_id)
        .with_for_update().execution_options(populate_existing=True))
    if not member or normalized_role(member.role) not in {"owner", "admin"}:
        raise HostedPolicyError("delegator_authority_removed")
    if agent:
        service._agent_is_active(agent, lock_authority=True)
        grant = delegation(request)
        if (agent.organization_id != task.organization_id or agent.delegated_by_user_id != task.created_by_user_id
                or not agent.require_approval or agent.token_prefix != "internal"
                or aware(agent.expires_at) != request.deadline_at or agent.max_actions_per_run != grant.max_actions_per_run
                or json_load(agent.allowed_tools_json, []) != grant.allowed_tools
                or json_load(agent.contract_ids_json, []) != grant.contract_ids
                or json_load(agent.assignee_ids_json, []) != grant.assignee_ids
                or json_load(agent.calendar_targets_json, []) != [t.model_dump() for t in grant.calendar_targets]):
            raise HostedPolicyError("delegation_binding_changed")
    if run:
        service._run_is_live(run)
    if request.contract_id:
        service._scope_contract(task.organization_id, request.contract_id)
        service._scope_assignee(task.organization_id, request.assignee_id)
        if task.evidence_id:
            evidence = service.read_agent_evidence(run, task.evidence_id)
            latest = service._source_version(task.organization_id, request.contract_id)
            if evidence.version_id != latest.id:
                raise HostedPolicyError("source_changed")
    if request.calendar:
        CalendarResource(request.calendar.connection_id, request.calendar.calendar_id).authorize(service, task.organization_id)
    return agent, run


def _finish_task(task, status, code=""):
    task.status, task.error_code, task.phase = status, code, "complete"
    task.completed_at = utcnow()


def _fail(service, task, code):
    if task.agent_id:
        service._lock_agent(task.agent_id)
    if task.run_id:
        run = service._lock_run(task.run_id)
        if run.status not in TERMINAL_RUN_STATES:
            service._end_run(run, "failed", code)
    _finish_task(task, "failed", code)


def _wait(task, settings, status):
    task.status = status
    task.next_attempt_at = min(aware(task.deadline_at), utcnow() + timedelta(seconds=settings.hosted_agent_wait_seconds))


def _first_proposal(request):
    return "propose_task" if request.contract_id else "propose_calendar"


def _advance(service, task):
    request = _request(task)
    agent, run = _context(service, task, request)
    if run and run.status in TERMINAL_RUN_STATES:
        if run.status == "succeeded" and not verified_completion(service, task, run):
            raise HostedPolicyError("completion_unverified")
        _finish_task(task, run.status, run.error_code)
        return None
    if task.attempts > service.settings.hosted_agent_max_attempts:
        raise HostedPolicyError("planning_attempts_exhausted")
    if task.model_state == "charged":
        raise HostedPolicyError("model_outcome_unknown")
    task.next_attempt_at = utcnow()
    if task.phase == "initialize":
        user = service.session.get(User, task.created_by_user_id)
        agent = service.create_agent(task.organization_id, user, delegation(request), internal=True, commit=False)
        run = service.create_agent_run(agent, workflow(request), execution_owner="lenslayer_hosted_agent", commit=False)
        task.agent_id, task.run_id = agent.id, run.id
        task.phase = "retrieve" if request.contract_id else "model" if request.planner_mode == "model" else _first_proposal(request)
    elif task.phase == "retrieve":
        evidence = service.retrieve_agent_evidence(agent, run.id, EvidenceRequest(contract_id=request.contract_id,
            version_id=request.version_id, query=request.query), commit=False)
        task.evidence_id = evidence.id
        task.phase = "model" if request.planner_mode == "model" else _first_proposal(request)
    elif task.phase == "model":
        if not model_available(service.settings):
            raise HostedPolicyError("model_unavailable")
        if task.model_calls != 0:
            raise HostedPolicyError("model_budget_exhausted")
        excerpt = service.read_agent_evidence(run, task.evidence_id).excerpt if request.contract_id else ""
        task.model_calls, task.model_state = 1, "charged"
        service._event(run, "hosted.model_charged", {"hosted_task_id": task.id, "model_call_number": 1})
        return request, excerpt  # charge commits before any network call
    elif task.phase == "confirm_input":
        record = service.session.get(AgentInputRequest, task.input_request_id)
        if not record or record.run_id != run.id:
            raise HostedPolicyError("checkpoint_missing")
        if record.supplied_at is None:
            _wait(task, service.settings, "awaiting_input")
        elif json_load(record.values_json, {}).get("confirm_plan") is True:
            task.phase, task.status = _first_proposal(request), "planning"
        else:
            raise HostedPolicyError("plan_declined")
    elif run.status == "awaiting_input":
        _wait(task, service.settings, "awaiting_input")
    elif task.phase in {"propose_task", "propose_calendar"}:
        kind = "task" if task.phase == "propose_task" else "calendar"
        service.propose_agent_action(agent, run.id, proposal(request, kind, task.evidence_id), commit=False)
        task.phase = "propose_calendar" if kind == "task" and request.calendar else "observe"
        task.status = "awaiting_approval"
    elif task.phase == "observe":
        _wait(task, service.settings, run.status)
    else:
        raise HostedPolicyError("checkpoint_invalid")
    return None


def _safe_code(exc):
    if isinstance(exc, (HostedPolicyError, hosted_agent_model.HostedModelError)):
        return exc.code
    if isinstance(exc, HTTPException):
        return {401: "agent_inactive", 403: "delegation_denied", 404: "source_unavailable",
            409: "source_or_policy_changed", 422: "invalid_fixed_plan"}.get(exc.status_code, "planning_failed")
    return "checkpoint_invalid"


def process_hosted_task(database, settings, store, task_id, token):
    try:
        with database.session_factory() as session:
            task = _locked(session, task_id, token)
            service = PlatformService(session, settings, store)
            try:
                with session.begin_nested():
                    model_input = _advance(service, task)
            except (HTTPException, HostedPolicyError, ValidationError) as exc:
                _fail(service, task, _safe_code(exc))
                model_input = None
            _fence_commit(session, task, token, release=model_input is None)
        if model_input is None:
            return True
        request, excerpt = model_input
        decision, error = None, None
        try:
            decision = hosted_agent_model.decide(settings, request, excerpt)
        except hosted_agent_model.HostedModelError as exc:
            error = exc.code
        # Always revalidate source/authority/lease after HTTP, including cancellation.
        with database.session_factory() as session:
            task = _locked(session, task_id, token)
            service = PlatformService(session, settings, store)
            try:
                with session.begin_nested():
                    request = _request(task)
                    agent, run = _context(service, task, request)
                    if run.status in TERMINAL_RUN_STATES:
                        raise HostedPolicyError("run_finished_during_model")
                    if task.model_state != "charged" or task.model_calls != 1:
                        raise HostedPolicyError("model_binding_changed")
                    if error:
                        raise HostedPolicyError(error)
                    task.model_state = "accepted"
                    if decision.decision == "decline":
                        raise HostedPolicyError("plan_declined")
                    if decision.decision == "needs_input":
                        record = service.request_agent_input(agent, run.id, InputRequestCreate(
                            idempotency_key="hosted-confirm-v1", reason="Confirm the fixed plan interpretation before proposing actions.",
                            fields=[{"name": "confirm_plan", "type": "boolean", "prompt": "Proceed with these exact supplied facts?"}],
                            expires_at=request.deadline_at, responder="human"), commit=False)
                        task.input_request_id, task.phase = record.id, "confirm_input"
                        _wait(task, settings, "awaiting_input")
                    else:
                        task.phase = _first_proposal(request)
                        task.next_attempt_at = utcnow()
            except (HTTPException, HostedPolicyError, ValidationError) as exc:
                _fail(service, task, _safe_code(exc))
            _fence_commit(session, task, token)
        return True
    except HostedLeaseLost:
        return False  # charge/checkpoint remains durable; successor never retries it
