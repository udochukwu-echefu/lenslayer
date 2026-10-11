"""Cloud Tasks wakes a private, request-billed worker; no idle polling process.

The database remains the work ledger. Delayed tasks contain only an empty body,
and a recovery request can reconstruct a missed wake from committed work.
"""
from __future__ import annotations

import hashlib
import logging
import math
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import BackgroundTasks
from sqlalchemy import and_, case, exists, func, or_, select, update

from .agent_models import AgentAction, AgentInputRequest, AgentPrincipal, AgentRun
from .hosted_agent_models import HostedAgentTask
from .models import Membership, utcnow
from .review_trigger import queue_review_worker
from .service_domains.common import aware

logger = logging.getLogger(__name__)
TERMINAL = ("succeeded", "failed", "cancelled")
_METADATA_TOKEN_URL = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"


def _changed_hosted_wait():
    """Committed ledger transitions reconstruct a wake lost after API commit."""
    changed_run = exists(select(AgentRun.id).where(AgentRun.id == HostedAgentTask.run_id,
        or_(AgentRun.status.in_(TERMINAL), and_(HostedAgentTask.phase == "observe",
            HostedAgentTask.status != AgentRun.status))))
    supplied_input = exists(select(AgentInputRequest.id).where(
        AgentInputRequest.id == HostedAgentTask.input_request_id,
        AgentInputRequest.run_id == HostedAgentTask.run_id,
        AgentInputRequest.supplied_at.is_not(None)))
    return or_(changed_run, and_(HostedAgentTask.phase == "confirm_input", supplied_input))


def recover_hosted_waits(database):
    """Resume changed waits without locks on run/input rows or a polling loop."""
    now = utcnow()
    with database.session_factory() as session:
        session.execute(update(HostedAgentTask).where(HostedAgentTask.status.not_in(TERMINAL),
            HostedAgentTask.next_attempt_at > now,
            or_(HostedAgentTask.lease_token.is_(None), HostedAgentTask.lease_expires_at <= now),
            _changed_hosted_wait()).values(next_attempt_at=now,
                revision=HostedAgentTask.revision + 1).execution_options(synchronize_session=False))
        session.commit()


def next_agent_wake_at(session, *, now=None):
    """Earliest runnable work, lease recovery, or expiry; human waits are timers."""
    now = now or utcnow()
    candidates = []

    def add(query):
        value = session.scalar(query)
        if value is not None:
            candidates.append(aware(value))

    add(select(func.min(case((HostedAgentTask.lease_token.is_not(None),
        case((HostedAgentTask.lease_expires_at > HostedAgentTask.next_attempt_at,
              HostedAgentTask.lease_expires_at), else_=HostedAgentTask.next_attempt_at)),
        else_=HostedAgentTask.next_attempt_at))).where(HostedAgentTask.status.not_in(TERMINAL)))
    add(select(func.min(AgentAction.updated_at)).where(AgentAction.status == "queued"))
    add(select(func.min(AgentAction.lease_expires_at)).where(AgentAction.status == "running"))
    live_run = AgentRun.status.not_in(TERMINAL)
    add(select(func.min(AgentRun.deadline_at)).where(live_run))
    add(select(func.min(AgentPrincipal.expires_at)).join(AgentRun, AgentRun.agent_id == AgentPrincipal.id).where(live_run))
    add(select(func.min(AgentAction.approval_expires_at)).join(AgentRun).where(live_run,
        AgentAction.status.in_(("awaiting_approval", "queued", "running")),
        AgentAction.approval_status.in_(("pending", "approved"))))
    add(select(func.min(AgentInputRequest.expires_at)).join(AgentRun).where(live_run, AgentInputRequest.supplied_at.is_(None)))
    authority = exists(select(Membership.id).where(Membership.organization_id == AgentPrincipal.organization_id,
        Membership.user_id == AgentPrincipal.delegated_by_user_id, Membership.role.in_(("owner", "admin"))))
    invalid = session.scalar(select(AgentRun.id).join(AgentPrincipal, AgentRun.agent_id == AgentPrincipal.id).where(
        live_run, or_(AgentPrincipal.revoked_at.is_not(None), ~authority)).limit(1))
    if invalid:
        candidates.append(now)
    changed_wait = session.scalar(select(HostedAgentTask.id).where(
        HostedAgentTask.status.not_in(TERMINAL),
        or_(HostedAgentTask.lease_token.is_(None), HostedAgentTask.lease_expires_at <= now),
        _changed_hosted_wait()).limit(1))
    if changed_wait:
        candidates.append(now)
    return min(candidates) if candidates else None


def nudge_hosted_tasks(database, *, run_id=None, agent_id=None, task_id=None, organization_id=None):
    """After the caller commits, resume a wait without reversing run/task lock order."""
    target = (HostedAgentTask.run_id == run_id if run_id else
              HostedAgentTask.agent_id == agent_id if agent_id else
              HostedAgentTask.id == task_id if task_id else
              HostedAgentTask.organization_id == organization_id if organization_id else None)
    if target is None:
        return
    with database.session_factory() as session:
        session.execute(update(HostedAgentTask).where(target, HostedAgentTask.status.not_in(TERMINAL)).values(
            next_attempt_at=utcnow(), revision=HostedAgentTask.revision + 1).execution_options(synchronize_session=False))
        session.commit()


def nudge_finished_hosted_tasks(database):
    with database.session_factory() as session:
        finished = exists(select(AgentRun.id).where(AgentRun.id == HostedAgentTask.run_id, AgentRun.status.in_(TERMINAL)))
        session.execute(update(HostedAgentTask).where(HostedAgentTask.status.not_in(TERMINAL), finished,
            HostedAgentTask.next_attempt_at > utcnow()).values(next_attempt_at=utcnow(),
                revision=HostedAgentTask.revision + 1).execution_options(synchronize_session=False))
        session.commit()


def nudge_hosted_action(database, action_id):
    with database.session_factory() as session:
        run_id = session.scalar(select(AgentAction.run_id).where(AgentAction.id == action_id))
    if run_id:
        nudge_hosted_tasks(database, run_id=run_id)


def enqueue_next_agent_wake(database, settings, *, transport=None, current_task_name=""):
    """Coalesce unchanged future timers. Return false so a delivered task retries."""
    if settings.agent_worker_mode != "on_demand":
        return True
    try:
        with database.session_factory() as session:
            next_at = next_agent_wake_at(session)
        if next_at is None:
            return True
        # Five-second slots coalesce bursts. Hourly recovery adds distant expiry
        # timers once they enter Cloud Tasks' 30-day horizon, without creating a
        # new rolling timer on every empty recovery request.
        now = utcnow()
        if next_at > now + timedelta(days=29):
            return True
        target = max(next_at + timedelta(seconds=2), now + timedelta(seconds=2))
        scheduled = datetime.fromtimestamp(math.ceil(target.timestamp() / 5) * 5, timezone.utc)
        stamp = scheduled.isoformat().replace("+00:00", "Z")
        # Chain early replacements from their delivered name. With clock skew,
        # A -> B -> C must never collide with completed A's deduplication tombstone.
        early_name = current_task_name.rsplit("/", 1)[-1] if next_at > now else ""
        if early_name:
            scheduled += timedelta(seconds=5)
            stamp = scheduled.isoformat().replace("+00:00", "Z")
        task_id = "w-" + hashlib.sha256((stamp + "|" + early_name).encode()).hexdigest()
        name = settings.agent_worker_queue + "/tasks/" + task_id
        origin = settings.agent_worker_url.rstrip("/")
        task = {"name": name, "scheduleTime": stamp, "dispatchDeadline": "300s", "httpRequest": {
            "httpMethod": "POST", "url": origin + "/drain", "headers": {"Content-Type": "application/json"},
            "body": "e30=", "oidcToken": {"serviceAccountEmail": settings.agent_worker_invoker_email, "audience": origin}}}
        with httpx.Client(timeout=5.0, trust_env=False, follow_redirects=False, transport=transport) as client:
            response = client.get(_METADATA_TOKEN_URL, headers={"Metadata-Flavor": "Google"})
            response.raise_for_status()
            token = response.json()["access_token"]
            response = client.post("https://cloudtasks.googleapis.com/v2/" + settings.agent_worker_queue + "/tasks",
                headers={"Authorization": "Bearer " + token}, json={"task": task})
            if response.status_code != 409:
                response.raise_for_status()
        return True
    except Exception:
        # Provider exceptions may contain headers/bodies. Never log them.
        logger.error("Agent worker wake was not scheduled; committed work requires recovery.")
        return False


def wake_agent_worker(database, settings, **targets):
    nudge_hosted_tasks(database, **targets)
    return enqueue_next_agent_wake(database, settings)


def queue_agent_worker(background_tasks: BackgroundTasks, request, *, fallback_review=False, **targets):
    settings = request.app.state.settings
    if settings.agent_worker_mode == "on_demand":
        # Request-billed API CPU can be throttled after its response. Perform
        # the bounded enqueue before replying; crash recovery uses the ledger.
        wake_agent_worker(request.app.state.database, settings, **targets)
    elif fallback_review:
        queue_review_worker(background_tasks, settings)
