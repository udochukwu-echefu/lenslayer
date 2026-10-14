"""Private Cloud Run HTTP target for Cloud Tasks and scheduled recovery.

Deploy with IAM invocation required, minimum instances zero, request-based CPU,
maximum instances/concurrency one. This app exposes no human or agent API routes.
"""
from fastapi import FastAPI, HTTPException, Request

from .agent_wake import enqueue_next_agent_wake, next_agent_wake_at, recover_hosted_waits
from .config import get_settings
from .database import Database
from .models import utcnow


def create_worker_application(settings=None):
    settings = settings or get_settings()
    app = FastAPI(title="LensLayer on-demand agent worker", docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/health/live")
    def live():
        return {"status": "ok"}

    @app.post("/drain")
    @app.post("/recover")
    def drain(request: Request):
        if settings.agent_worker_mode != "on_demand":
            raise HTTPException(503, "On-demand execution is not configured.")
        database = Database(settings)
        try:
            recover_hosted_waits(database)
            with database.session_factory() as session:
                next_at = next_agent_wake_at(session)
            runnable = next_at is not None and next_at <= utcnow()
            if runnable:
                # Import/initialize document-related code only when work exists.
                from .worker import run_worker
                run_worker(settings, drain=True, agents_only=True,
                    max_drain_seconds=settings.agent_worker_drain_seconds)
            if not enqueue_next_agent_wake(database, settings,
                    current_task_name=request.headers.get("X-CloudTasks-TaskName", "")):
                raise HTTPException(503, "Work is saved; its next wake requires retry.")
            from .agent_observability import observe_agent_worker
            observe_agent_worker(database, settings)
            return {"status": "drained" if runnable else "idle"}
        finally:
            database.dispose()

    return app


app = create_worker_application()
