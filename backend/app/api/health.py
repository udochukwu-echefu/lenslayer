from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import func, select, text

from ..config import Settings
from ..database import Database
from ..object_storage import ObjectStore
from ..schemas import HealthResponse
from ..agent_models import AgentAction, AgentWorkerHeartbeat
from ..agent_schemas import WorkerHealthResponse
from ..hosted_agent_models import HostedAgentTask
from ..models import utcnow
from ..service_domains.common import aware


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
            session.execute(select(AgentAction.dispatch_intent_json).limit(0))
            session.execute(select(HostedAgentTask.revision).limit(0))
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
        age = (utcnow() - aware(last_seen)).total_seconds() if last_seen else None
        if age is None or age > request.app.state.settings.worker_health_max_age_seconds:
            raise HTTPException(503, "No recent worker heartbeat.")
        return {"status": "ready", "service": "platform-worker", "heartbeat_age_seconds": max(0, age)}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Worker health is unavailable.") from None
