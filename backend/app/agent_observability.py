"""Small ledger health observations emitted only during an existing worker request.

No tenant, goal, source, credential, callback, action or run identifiers are
logged. There is no extra worker loop, heartbeat, provider call or scheduler.
"""
import json
from datetime import timedelta

from sqlalchemy import func, select

from .agent_models import AgentAction, AgentRunEvent
from .agent_wake import next_agent_wake_at
from .connector_models import CalendarCredential
from .models import utcnow
from .service_domains.common import aware


def observe_agent_worker(database, settings):
    try:
        now = utcnow()
        with database.session_factory() as session:
            next_at = next_agent_wake_at(session, now=now)
            overdue = max(0, (now - aware(next_at)).total_seconds()) if next_at else 0
            expired = session.scalar(select(func.count()).select_from(AgentAction).where(
                AgentAction.status == "running", AgentAction.lease_expires_at <= now)) or 0
            uncertain = session.scalar(select(func.count()).select_from(AgentAction).where(
                AgentAction.status == "unknown_outcome")) or 0
            revocations = session.scalar(select(func.count()).select_from(CalendarCredential).where(
                CalendarCredential.revoke_pending.is_(True))) or 0
            partial = session.scalar(select(func.count()).select_from(AgentRunEvent).where(
                AgentRunEvent.type == "action.partial_effect",
                AgentRunEvent.created_at >= now - timedelta(hours=2))) or 0
        needs_attention = (overdue > settings.worker_health_max_age_seconds
                           or expired > 0 or uncertain > 0 or revocations > 0 or partial > 0)
        payload = {
            "kind": "lenslayer_agent_worker_health",
            "severity": "WARNING" if needs_attention else "INFO",
            "state": "attention" if needs_attention else "healthy",
            "overdue_wake_seconds": int(overdue),
            "expired_action_leases": int(expired),
            "unknown_action_outcomes": int(uncertain),
            "pending_provider_revocations": int(revocations),
            "recent_partial_effects": int(partial),
        }
    except Exception:
        # Observability failure cannot undo a committed, idempotent effect or
        # leak exception/SQL/provider details. Separate alerts catch this state.
        payload = {"kind": "lenslayer_agent_worker_health", "severity": "ERROR", "state": "unavailable"}
    print(json.dumps(payload, separators=(",", ":")), flush=True)
    return payload
