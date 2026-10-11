"""Tenant-safe human administration; no browser credential contract."""
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select, update

from .agent_resources import CalendarResource
from .hosted_agent_models import HostedAgentTask
from .hosted_agent_schemas import GOAL_TYPES, HostedCapabilities, HostedTaskResponse
from .models import Membership, Organization, utcnow
from .service_domains.agents import TERMINAL_RUN_STATES, canonical_json, digest
from .service_domains.common import aware, normalized_role


def model_available(settings):
    return settings.hosted_model_enabled and bool(settings.hosted_model_api_key.strip())


class HostedAgentService:
    def __init__(self, platform):
        self.platform = platform
        self.session, self.settings = platform.session, platform.settings

    def admin(self, organization_id, user):
        membership = self.session.scalar(select(Membership).where(
            Membership.organization_id == organization_id, Membership.user_id == user.id)
            .with_for_update().execution_options(populate_existing=True))
        if not membership or normalized_role(membership.role) not in {"owner", "admin"}:
            raise HTTPException(403, "Only owners/admins may administer hosted tasks.")

    def capabilities(self, organization_id, user):
        self.admin(organization_id, user)
        return HostedCapabilities(enabled=self.settings.hosted_agents_enabled, goal_types=GOAL_TYPES,
            planner_modes=["deterministic"] + (["model"] if model_available(self.settings) else []))

    def create(self, organization_id, user, request):
        # Serialize tenant idempotency creation/replay on SQLite and PostgreSQL.
        self.session.execute(update(Organization).where(Organization.id == organization_id)
            .values(name=Organization.name).execution_options(synchronize_session=False))
        self.admin(organization_id, user)
        serialized = canonical_json(request.facts())
        existing = self.session.scalar(select(HostedAgentTask).where(
            HostedAgentTask.organization_id == organization_id, HostedAgentTask.idempotency_key == request.idempotency_key))
        if existing:
            if existing.request_sha256 != digest(serialized):
                raise HTTPException(409, "Hosted idempotency key already binds different input.")
            self.session.commit()
            return existing
        if not self.settings.hosted_agents_enabled:
            raise HTTPException(503, "Hosted tasks are disabled.")
        if request.planner_mode == "model" and not model_available(self.settings):
            raise HTTPException(503, "Hosted model mode is unavailable; use deterministic mode.")
        if not utcnow() < request.deadline_at <= utcnow() + timedelta(days=7):
            raise HTTPException(422, "Hosted deadline must be future and within seven days.")
        if request.contract_id:
            self.platform._scope_contract(organization_id, request.contract_id)
            self.platform._scope_assignee(organization_id, request.assignee_id)
            if request.version_id:
                self.platform._source_version(organization_id, request.contract_id, request.version_id)
        if request.calendar:
            CalendarResource(request.calendar.connection_id, request.calendar.calendar_id).authorize(self.platform, organization_id)
        task = HostedAgentTask(organization_id=organization_id, created_by_user_id=user.id,
            idempotency_key=request.idempotency_key, request_json=serialized, request_sha256=digest(serialized),
            goal_type=request.goal_type, goal=request.goal, planner_mode=request.planner_mode, deadline_at=request.deadline_at)
        self.session.add(task)
        self.session.flush()
        self.platform._audit(organization_id, user.id, "hosted_task.created", detail={"hosted_task_id": task.id})
        self.session.commit()
        return task

    def get(self, organization_id, task_id, user):
        self.admin(organization_id, user)
        task = self.session.scalar(select(HostedAgentTask).where(
            HostedAgentTask.id == task_id, HostedAgentTask.organization_id == organization_id))
        if task is None:
            raise HTTPException(404, "Hosted task not found.")
        return task

    def list(self, organization_id, user, limit):
        self.admin(organization_id, user)
        return self.session.scalars(select(HostedAgentTask).where(HostedAgentTask.organization_id == organization_id)
            .order_by(HostedAgentTask.created_at.desc(), HostedAgentTask.id).limit(limit)).all()

    def cancel(self, organization_id, task_id, user):
        # Match worker lock order: hosted task -> principal -> run -> membership.
        self.platform.workspace.require_roles(organization_id, user, {"owner", "admin"}, "Only owners/admins may cancel hosted tasks.")
        changed = self.session.execute(update(HostedAgentTask).where(
            HostedAgentTask.id == task_id, HostedAgentTask.organization_id == organization_id)
            .values(revision=HostedAgentTask.revision + 1).execution_options(synchronize_session=False)).rowcount
        if not changed:
            raise HTTPException(404, "Hosted task not found.")
        task = self.session.get(HostedAgentTask, task_id, populate_existing=True)
        if task.status not in TERMINAL_RUN_STATES:
            if task.agent_id:
                self.platform._lock_agent(task.agent_id)
            run = self.platform._lock_run(task.run_id) if task.run_id else None
            self.admin(organization_id, user)
            # If a run finished before cancellation acquired its lock, honor its
            # immutable receipt rather than falsely reporting no effect.
            if run and run.status in TERMINAL_RUN_STATES:
                from .hosted_agent_runtime import verified_completion
                if run.status == "succeeded" and not verified_completion(self.platform, task, run):
                    task.status, task.error_code = "failed", "completion_unverified"
                else:
                    task.status, task.error_code = run.status, run.error_code
            else:
                if run:
                    self.platform._end_run(run, "cancelled", "cancelled_by_operator")
                task.status, task.error_code = "cancelled", "cancelled_by_operator"
            task.phase, task.completed_at = "complete", utcnow()
            task.lease_token = task.lease_expires_at = None
            self.platform._audit(organization_id, user.id, "hosted_task.cancelled", detail={"hosted_task_id": task.id})
        self.session.commit()
        return task

    @staticmethod
    def response(task):
        return HostedTaskResponse(id=task.id, organization_id=task.organization_id, created_by_user_id=task.created_by_user_id,
            goal_type=task.goal_type, goal=task.goal, planner_mode=task.planner_mode, status=task.status,
            phase=task.phase, run_id=task.run_id, agent_id=task.agent_id, error_code=task.error_code,
            deadline_at=aware(task.deadline_at), created_at=aware(task.created_at), updated_at=aware(task.updated_at),
            completed_at=aware(task.completed_at) if task.completed_at else None)
