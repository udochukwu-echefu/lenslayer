"""Graph readiness/retention helpers; no idle loop or external side effects."""
from sqlalchemy import and_, exists, or_, select, update

from fastapi import HTTPException

from .agent_generalization_models import ContextRecord, ContextVersion, WorkflowGraphNode
from .agent_models import AgentAction, AgentRun
from .models import Membership, utcnow
from .service_domains.agents import TERMINAL_RUN_STATES, digest
from .service_domains.common import aware, json_load


def graph_action_eligible(now):
    node = exists(select(WorkflowGraphNode.node_id).where(WorkflowGraphNode.action_id == AgentAction.id))
    ready = exists(select(WorkflowGraphNode.node_id).where(WorkflowGraphNode.action_id == AgentAction.id,
        WorkflowGraphNode.status == "ready", WorkflowGraphNode.not_before_at <= now))
    return or_(~node, ready)


def graph_wake_at(session, now):
    """Reconstruct timers/readiness from committed checkpoints, not polling."""
    rows = session.execute(select(WorkflowGraphNode, AgentAction).join(
        AgentAction, AgentAction.id == WorkflowGraphNode.action_id).join(
        AgentRun, AgentRun.id == WorkflowGraphNode.run_id).where(
        AgentRun.status.not_in(TERMINAL_RUN_STATES))).all()
    progress = {(n.run_id, n.node_id): n.status for n, _ in rows}
    candidates = []
    for node, action in rows:
        if action.status == "queued":
            if node.status == "ready":
                candidates.append(aware(node.not_before_at))
            elif node.status == "blocked" and all(progress.get((node.run_id, dep)) in {"completed", "skipped"}
                    for dep in json_load(node.depends_on_json, [])):
                candidates.append(now)
        if action.status == "succeeded" and node.status != "completed":
            candidates.append(now)
    return min(candidates) if candidates else None


def validate_context_approval(session, agent, run, action):
    if digest(action.input_json) != action.input_sha256:
        raise HTTPException(409, "Action input hash changed.")
    if not agent.require_approval:
        return
    if (action.approval_status != "approved" or action.approved_by_user_id is None
            or action.approved_input_sha256 != action.input_sha256
            or action.approval_expires_at is None or aware(action.approval_expires_at) <= utcnow()):
        raise HTTPException(409, "Approval is missing, stale or expired.")
    membership = session.scalar(select(Membership).where(
        Membership.organization_id == run.organization_id,
        Membership.user_id == action.approved_by_user_id).with_for_update())
    if membership is None or membership.role not in {"owner", "admin"}:
        raise HTTPException(403, "Approver no longer has authority.")


def recover_workflow_graphs(database, settings, object_store, *, stop_at=None):
    from .services import PlatformService
    import time
    with database.session_factory() as session:
        ids = session.scalars(select(WorkflowGraphNode.run_id).join(AgentRun, AgentRun.id == WorkflowGraphNode.run_id).join(
            AgentAction, AgentAction.id == WorkflowGraphNode.action_id).where(
            AgentRun.status.not_in(TERMINAL_RUN_STATES),
            or_(and_(WorkflowGraphNode.status == "blocked", AgentAction.status == "queued"),
                and_(WorkflowGraphNode.status != "completed", AgentAction.status == "succeeded")))
            .distinct().limit(1000)).all()
    for run_id in ids:
        if stop_at is not None and time.monotonic() >= stop_at:
            break
        with database.session_factory() as session:
            run = session.get(AgentRun, run_id)
            service = PlatformService(session, settings, object_store)
            agent = service._lock_agent(run.agent_id)
            run = service._lock_run(run.id)
            service.advance_workflow_graph(agent, run)
            session.commit()


def purge_expired_context(database):
    with database.session_factory() as session:
        records = session.scalars(select(ContextRecord).where(ContextRecord.expires_at <= utcnow(),
            exists(select(ContextVersion.id).where(ContextVersion.record_id == ContextRecord.id,
                ContextVersion.text.is_not(None)))).order_by(ContextRecord.id).limit(1000).with_for_update()).all()
        for record in records:
            session.execute(update(ContextRecord).where(ContextRecord.id == record.id).values(
                revision=ContextRecord.revision + 1, deleted_at=record.deleted_at or utcnow()))
            session.execute(update(ContextVersion).where(ContextVersion.record_id == record.id).values(text=None))
        session.commit()
        return len(records)
