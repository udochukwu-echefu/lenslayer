"""Durable dispatch for the bounded internal task tool.

No model reasoning or network side effects run here. Task creation, read-back
verification, action receipt, run outcome, and events commit atomically. A worker
that dies before commit leaves a reclaimable lease without a partially created
task. The immutable output ID is also stable across retry attempts.
"""
from __future__ import annotations

from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import and_, exists, or_, select, update

from .agent_models import AgentAction, AgentInputRequest, AgentPrincipal, AgentRun
from .agent_schemas import TaskActionInput, TaskSuccessCondition
from .agent_tools import get_tool, selected_condition
from .config import Settings
from .database import Database
from .models import Membership, WorkflowTask, new_id, utcnow
from .object_storage import ObjectStore
from .service_domains.agents import LIVE_ACTION_STATES, TERMINAL_RUN_STATES, digest
from .service_domains.common import aware, json_dump, json_load
from .services import PlatformService


class LeaseLost(Exception):
    pass


def claim_next_agent_action(database: Database, settings: Settings) -> tuple[str, str] | None:
    now = utcnow()
    eligible = or_(AgentAction.status == "queued", and_(
        AgentAction.status == "running", AgentAction.lease_expires_at <= now,
    ))
    with database.session_factory() as session:
        # Compare-and-swap works on both SQLite and PostgreSQL. Never keep a
        # claimed action's transaction open while acquiring principal/run locks.
        candidates = session.scalars(select(AgentAction.id).where(eligible)
                                    .order_by(AgentAction.created_at, AgentAction.id).limit(10)).all()
        for action_id in candidates:
            token = new_id()
            changed = session.execute(update(AgentAction).where(
                AgentAction.id == action_id, eligible,
            ).values(status="running", attempts=AgentAction.attempts + 1, lease_token=token,
                     lease_expires_at=now + timedelta(seconds=settings.agent_action_lease_seconds))
              .execution_options(synchronize_session=False)).rowcount
            session.commit()
            if changed:
                return action_id, token
    return None


def _failure_code(exc: HTTPException) -> str:
    return {401: "agent_inactive", 403: "delegation_denied", 404: "source_unavailable",
            409: "evidence_or_policy_expired", 422: "invalid_action"}.get(exc.status_code, "action_failed")


def process_agent_action(database: Database, settings: Settings, object_store: ObjectStore,
                          action_id: str, lease_token: str) -> bool:
    with database.session_factory() as lookup:
        candidate = lookup.get(AgentAction, action_id)
        try:
            definition = get_tool(candidate.tool, candidate.tool_version) if candidate else None
        except HTTPException:
            definition = None  # internal failure path records unsupported ledger input durably
    if definition and definition.execute is not None:
        return definition.execute(database, settings, object_store, action_id, lease_token)
    return process_task_action(database, settings, object_store, action_id, lease_token)


def process_task_action(database: Database, settings: Settings, object_store: ObjectStore,
                        action_id: str, lease_token: str) -> bool:
    with database.session_factory() as session:
        initial = session.get(AgentAction, action_id)
        if initial is None:
            return False
        run = session.get(AgentRun, initial.run_id)
        if run is None:
            return False
        service = PlatformService(session, settings, object_store)
        agent = service._lock_agent(run.agent_id)
        run = service._lock_run(run.id)
        action = session.scalar(select(AgentAction).where(AgentAction.id == action_id)
                                .with_for_update().execution_options(populate_existing=True))
        now = utcnow()
        if (action.status != "running" or action.lease_token != lease_token
                or action.lease_expires_at is None or aware(action.lease_expires_at) <= now):
            session.rollback()
            return False
        if run.status in TERMINAL_RUN_STATES:
            action.status, action.error_code, action.completed_at = "cancelled", "run_finished", now
            action.lease_token = action.lease_expires_at = None
            session.commit()
            return False
        try:
            service._agent_is_active(agent, lock_authority=True)
            service._run_is_live(run)
            if action.attempts > settings.agent_action_max_attempts:
                raise HTTPException(status_code=409, detail="Dispatch retry limit exceeded.")
            if action.tool != "workspace.tasks.create" or action.tool_version != "1":
                raise HTTPException(status_code=422, detail="Unsupported action tool or version.")
            if digest(action.input_json) != action.input_sha256:
                raise HTTPException(status_code=409, detail="Invalid action input binding.")
            if agent.require_approval and (
                action.approval_status != "approved" or action.approved_by_user_id is None
                or action.approved_input_sha256 != action.input_sha256
                or action.approval_expires_at is None or aware(action.approval_expires_at) <= now
            ):
                raise HTTPException(status_code=409, detail="Approval is missing, stale, or expired.")
            if agent.require_approval:
                approver = session.scalar(select(Membership).where(
                    Membership.organization_id == run.organization_id,
                    Membership.user_id == action.approved_by_user_id,
                ).with_for_update())
                if approver is None or approver.role not in {"owner", "admin"}:
                    raise HTTPException(status_code=403, detail="The approver no longer has approval authority.")
            payload = TaskActionInput.model_validate_json(action.input_json)
            evidence = service.validate_agent_task_input(agent, run, payload)
            condition = TaskSuccessCondition.model_validate(selected_condition(run, payload))
            reference = {
                "agent_id": agent.id, "run_id": run.id, "action_id": action.id,
                "evidence_id": evidence.id, "version_id": evidence.version_id,
                "source_sha256": evidence.source_sha256, "start_offset": evidence.start_offset,
                "end_offset": evidence.end_offset,
            }
            if payload.deadline_basis:
                reference["deadline_basis"] = payload.deadline_basis.model_dump(mode="json")
                reference["deadline_basis_origin"] = "caller_supplied"
            # The savepoint removes the task if verification fails while allowing
            # a durable failed action receipt to be committed outside it.
            with session.begin_nested():
                task = session.get(WorkflowTask, action.output_id)
                if task is None:
                    task = WorkflowTask(
                        id=action.output_id, organization_id=run.organization_id,
                        contract_id=payload.contract_id, created_by_user_id=agent.delegated_by_user_id,
                        assigned_to_user_id=payload.assigned_to_user_id, title=payload.title,
                        description=payload.description, category="follow_up", priority="normal", status="open",
                        due_at=payload.due_at, source_kind="deadline", source_reference_json=json_dump(reference),
                    )
                    session.add(task)
                    session.flush()
                session.refresh(task)
                verified = get_tool(action.tool, action.tool_version).check_completion(
                    task, condition, payload, reference, run.organization_id, agent.delegated_by_user_id)
                if not verified:
                    raise HTTPException(status_code=409, detail="Task read-back did not satisfy the success condition.")
                service._run_is_live(run)
                if aware(agent.expires_at) <= utcnow():
                    raise HTTPException(status_code=401, detail="The agent expired during dispatch.")
                if agent.require_approval and aware(action.approval_expires_at) <= utcnow():
                    raise HTTPException(status_code=409, detail="The approval expired during dispatch.")
                # Recheck the fence at the end of the transaction. Other claims
                # cannot replace this token once the action row is locked.
                fenced = session.execute(update(AgentAction).where(
                    AgentAction.id == action.id, AgentAction.lease_token == lease_token,
                    AgentAction.status == "running", AgentAction.lease_expires_at > utcnow(),
                ).values(status="succeeded").execution_options(synchronize_session=False)).rowcount
                if not fenced:
                    raise LeaseLost()
            result = {
                "type": "workspace_task_created", "task_id": task.id,
                "contract_id": task.contract_id, "assigned_to_user_id": task.assigned_to_user_id,
                "due_at": aware(task.due_at).isoformat(), "evidence_id": evidence.id,
                "version_id": evidence.version_id, "verified": True,
                "verification_method": "database_read_back", "verified_at": utcnow().isoformat(),
            }
            action.status, action.result_json, action.completed_at = "succeeded", json_dump(result), utcnow()
            action.lease_token = action.lease_expires_at = None
            service._event(run, "action.succeeded", {"action_id": action.id, "task_id": task.id, "verified": True})
            service.checkpoint_agent_action(run, action, result)
            service._audit(run.organization_id, agent.delegated_by_user_id, "task.created", task.contract_id,
                           {"task_id": task.id, "agent_id": agent.id, "run_id": run.id, "action_id": action.id})
            service._audit(run.organization_id, agent.delegated_by_user_id, "agent.run_succeeded", detail={
                "run_id": run.id, "agent_id": agent.id, "action_id": action.id, "task_id": task.id,
            })
            session.commit()
            return True
        except LeaseLost:
            session.rollback()
            return False
        except HTTPException as exc:
            code = "retry_limit_exceeded" if action.attempts > settings.agent_action_max_attempts else _failure_code(exc)
            action.status, action.error_code, action.completed_at = "failed", code, utcnow()
            action.lease_token = action.lease_expires_at = None
            service._event(run, "action.failed", {"action_id": action.id, "error_code": code})
            service._end_run(run, "failed", code)
            service._audit(run.organization_id, agent.delegated_by_user_id, "agent.action_failed", detail={
                "run_id": run.id, "action_id": action.id, "error_code": code,
            })
            session.commit()
            return False
        # Unexpected database/process failures propagate and roll back this
        # transaction. The previously committed lease remains reclaimable.


def expire_agent_runs(database: Database, settings: Settings, object_store: ObjectStore) -> int:
    """Close abandoned/expired runs even when there is no action to dispatch."""
    now = utcnow()
    with database.session_factory() as session:
        delegated_authority = exists(select(Membership.id).where(
            Membership.organization_id == AgentPrincipal.organization_id,
            Membership.user_id == AgentPrincipal.delegated_by_user_id,
            Membership.role.in_(["owner", "admin"]),
        ))
        stale_approval = exists(select(AgentAction.id).where(
            AgentAction.run_id == AgentRun.id, AgentAction.status.in_(LIVE_ACTION_STATES),
            AgentAction.approval_status.in_(["pending", "approved"]),
            AgentAction.approval_expires_at <= now,
        ))
        stale_input = exists(select(AgentInputRequest.id).where(
            AgentInputRequest.run_id == AgentRun.id, AgentInputRequest.supplied_at.is_(None),
            AgentInputRequest.expires_at <= now))
        run_ids = session.scalars(select(AgentRun.id).join(AgentPrincipal, AgentRun.agent_id == AgentPrincipal.id).where(
            AgentRun.status.not_in(TERMINAL_RUN_STATES),
            or_(AgentRun.deadline_at <= now, AgentPrincipal.expires_at <= now,
                AgentPrincipal.revoked_at.is_not(None), ~delegated_authority, stale_approval, stale_input),
        ).order_by(AgentRun.created_at).limit(1000)).all()
    closed = 0
    for run_id in run_ids:
        with database.session_factory() as session:
            run = session.get(AgentRun, run_id)
            if run is None:
                continue
            service = PlatformService(session, settings, object_store)
            agent = service._lock_agent(run.agent_id)
            run = service._lock_run(run.id)
            if run.status in TERMINAL_RUN_STATES:
                session.rollback()
                continue
            code = ""
            if aware(run.deadline_at) <= utcnow():
                code = "deadline_exceeded"
            else:
                try:
                    service._agent_is_active(agent, lock_authority=True)
                except HTTPException:
                    code = "agent_inactive"
            if not code:
                if session.scalar(select(AgentInputRequest.id).where(AgentInputRequest.run_id == run.id,
                    AgentInputRequest.supplied_at.is_(None), AgentInputRequest.expires_at <= utcnow()).limit(1)):
                    code = "input_expired"
            if not code:
                expired_approval = session.scalar(select(AgentAction.id).where(
                    AgentAction.run_id == run.id,
                    AgentAction.status.in_(LIVE_ACTION_STATES),
                    AgentAction.approval_status.in_(["pending", "approved"]),
                    AgentAction.approval_expires_at <= utcnow(),
                ).limit(1))
                if expired_approval:
                    code = "approval_expired"
            if code:
                service._end_run(run, "failed", code)
                closed += 1
                session.commit()
            else:
                session.rollback()
    return closed
