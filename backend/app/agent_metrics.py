"""Tenant-safe durable counters derived from the ledger, never process globals."""
from sqlalchemy import func, select

from .agent_models import AgentAction, AgentRun, AgentRunEvent
from .connector_models import CalendarCredential
from .models import utcnow
from .service_domains.common import aware


def agent_metrics(service, organization_id, user):
    service.workspace.require_roles(organization_id, user, {"owner", "admin"}, "Only owners/admins can inspect execution metrics.")
    session = service.session
    runs = dict(session.execute(select(AgentRun.status, func.count()).where(
        AgentRun.organization_id == organization_id).group_by(AgentRun.status)).all())
    actions = dict(session.execute(select(AgentAction.status, func.count()).join(AgentRun).where(
        AgentRun.organization_id == organization_id).group_by(AgentAction.status)).all())
    counters = dict(session.execute(select(AgentRunEvent.type, func.count()).join(AgentRun).where(
        AgentRun.organization_id == organization_id).group_by(AgentRunEvent.type)).all())
    oldest = session.scalar(select(func.min(AgentAction.created_at)).join(AgentRun).where(
        AgentRun.organization_id == organization_id, AgentAction.status == "queued"))
    expired_leases = session.scalar(select(func.count()).select_from(AgentAction).join(AgentRun).where(
        AgentRun.organization_id == organization_id, AgentAction.status == "running", AgentAction.lease_expires_at <= utcnow()))
    retries = session.scalar(select(func.coalesce(func.sum(AgentAction.attempts - 1), 0)).join(AgentRun).where(
        AgentRun.organization_id == organization_id, AgentAction.attempts > 1))
    revocations = session.scalar(select(func.count()).select_from(CalendarCredential).where(
        CalendarCredential.organization_id == organization_id, CalendarCredential.revoke_pending.is_(True)))
    return {"runs_by_status": runs, "actions_by_status": actions, "event_counters": counters,
            "expired_action_leases": expired_leases, "retry_attempts": retries,
            "oldest_queued_action_age_seconds": max(0, (utcnow() - aware(oldest)).total_seconds()) if oldest else 0,
            "pending_provider_revocations": revocations, "observed_at": utcnow().isoformat()}
