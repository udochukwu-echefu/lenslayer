from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import func, select, text

from ..config import Settings
from ..database import Database
from ..object_storage import ObjectStore
from ..schemas import HealthResponse
from ..agent_models import AgentAction, AgentPrincipal, AgentRun, AgentWorkerHeartbeat
from ..agent_generalization_models import ContextRecord, ContextVersion, ContextEvidence, WorkflowGraph, WorkflowGraphNode
from ..connector_models import CalendarCredential, CalendarOAuthState, CalendarSessionProof
from ..agent_schemas import WorkerHealthResponse
from ..hosted_agent_models import HostedAgentTask, HostedModelLifetimeBudget, HostedModelReservation
from ..models import utcnow
from ..service_domains.common import aware
from ..agent_wake import next_agent_wake_at


router = APIRouter()


@router.get("/health/live", response_model=HealthResponse, tags=["health"])
def live(request: Request) -> HealthResponse:
    settings_value: Settings = request.app.state.settings
    return HealthResponse(status="ok", service="platform-api", environment=settings_value.environment)


@router.get("/health/ready", response_model=HealthResponse, tags=["health"])
def ready(request: Request) -> HealthResponse:
    database: Database = request.app.state.database
    object_store: ObjectStore = request.app.state.object_store
    try:
        with database.session_factory() as session:
            session.execute(text("SELECT 1"))
            required = (AgentAction.dispatch_intent_json, AgentPrincipal.context_ids_json, AgentRun.context_ids_json,
                        ContextRecord.revision, ContextVersion.source_sha256, ContextEvidence.source_sha256,
                        WorkflowGraph.plan_sha256, WorkflowGraphNode.action_id, HostedAgentTask.model_selection_sha256,
                        HostedModelLifetimeBudget.reserved_calls, HostedModelReservation.selection_sha256,
                        CalendarCredential.session_fingerprint, CalendarOAuthState.binding_sha256, CalendarSessionProof.nonce_sha256)
            # One round trip, no source/credential rows read. Each zero-row
            # scalar subquery still requires its relation/column to exist.
            session.execute(select(*(select(column).limit(0).scalar_subquery() for column in required)))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database is unavailable.") from exc
    if not object_store.healthy():
        raise HTTPException(status_code=503, detail="Object storage is unavailable.")
    return HealthResponse(status="ready", service="platform-api", environment=request.app.state.settings.environment)


@router.get("/health/worker", tags=["health"], response_model=WorkerHealthResponse)
def worker_ready(request: Request):
    try:
        with request.app.state.database.session_factory() as session:
            last_seen = session.scalar(select(func.max(AgentWorkerHeartbeat.last_seen_at)).where(
                AgentWorkerHeartbeat.lane.in_(["agents", "mixed"])))
            next_at = next_agent_wake_at(session) if request.app.state.settings.agent_worker_mode == "on_demand" else None
        age = (utcnow() - aware(last_seen)).total_seconds() if last_seen else None
        if request.app.state.settings.agent_worker_mode == "on_demand":
            lag = (utcnow() - next_at).total_seconds() if next_at else 0
            if lag > request.app.state.settings.worker_health_max_age_seconds:
                raise HTTPException(503, "Runnable agent work is overdue.")
            return {"status": "ready", "service": "platform-worker", "heartbeat_age_seconds": max(0, age) if age is not None else None,
                    "execution_mode": "on_demand", "state": "scheduled" if next_at else "idle"}
        if age is None or age > request.app.state.settings.worker_health_max_age_seconds:
            raise HTTPException(503, "No recent worker heartbeat.")
        return {"status": "ready", "service": "platform-worker", "heartbeat_age_seconds": max(0, age)}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Worker health is unavailable.") from None
