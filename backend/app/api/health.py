from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import text

from ..config import Settings
from ..database import Database
from ..object_storage import ObjectStore
from ..schemas import HealthResponse


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
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database is unavailable.") from exc
    if not object_store.healthy():
        raise HTTPException(status_code=503, detail="Object storage is unavailable.")
    return HealthResponse(status="ready", service="platform-api", environment=request.app.state.settings.environment)
