from __future__ import annotations

from collections.abc import Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import health_router, router
from .config import Settings, get_settings
from .database import Database
from .document_intelligence import ReviewWorkflow, build_review_workflow
from .object_storage import build_object_store


def create_app(
    settings: Settings | None = None,
    review_workflow_factory: Callable[[], ReviewWorkflow] = build_review_workflow,
) -> FastAPI:
    runtime_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database = Database(runtime_settings)
        if runtime_settings.auto_create_schema:
            database.create_schema()
        app.state.settings = runtime_settings
        app.state.database = database
        app.state.object_store = build_object_store(runtime_settings)
        app.state.review_workflow = review_workflow_factory()
        try:
            yield
        finally:
            database.dispose()

    application = FastAPI(
        title=runtime_settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if runtime_settings.environment.lower() != "production" else None,
        redoc_url=None,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=runtime_settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-LensLayer-User", "X-LensLayer-Email", "X-LensLayer-Name"],
    )

    application.include_router(health_router)
    application.include_router(router, prefix=runtime_settings.api_prefix.rstrip("/"))
    return application


app = create_app()
