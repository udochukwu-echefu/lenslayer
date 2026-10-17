"""Bounded execution for blocking upload units, not request-scoped ORM objects."""
from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import CancelledError
from threading import Lock
from typing import TypeVar

import anyio
from fastapi import Request
from pydantic import BaseModel

from ..services import PlatformService


T = TypeVar("T", bound=BaseModel)


async def run_upload(request: Request, operation: Callable[[PlatformService], T]) -> T:
    """Create, use and close the session in one worker; return only serialized data.

    Callbacks must resolve identity and serialize their response here, and must not
    capture a request dependency's session, service or ORM user. The separate
    limiter leaves FastAPI's ordinary sync reads/dependencies free to run.
    """
    state = request.app.state
    # Initialized on the app's event loop, without an intervening await. Never
    # share a limiter across app instances (or create a session while queued).
    if not hasattr(state, "upload_limiter"):
        state.upload_limiter = anyio.CapacityLimiter(state.settings.upload_concurrency)

    limiter = state.upload_limiter
    borrower = object()
    await limiter.acquire_on_behalf_of(borrower)
    start_lock = Lock()
    started = False
    cancelled_before_start = False

    def execute() -> T:
        nonlocal started
        with start_lock:
            if cancelled_before_start:
                raise CancelledError()
            started = True
        try:
            with state.database.session_factory() as session:
                service = PlatformService(
                    session, state.settings, state.object_store, state.review_workflow,
                )
                return operation(service)
        finally:
            # The worker, not its waiting request, owns an admitted slot. Raw
            # asyncio Task.cancel() bypasses AnyIO's cancel-scope shielding, but
            # must not admit another write until this session has closed.
            anyio.from_thread.run_sync(limiter.release_on_behalf_of, borrower)

    # A running write cannot safely be killed. Keep its slot until commit or
    # rollback/object cleanup and session close, even on cancellation. Admission
    # above already bounds threads; do not also consume FastAPI's read pool.
    try:
        return await anyio.to_thread.run_sync(
            execute, limiter=anyio.CapacityLimiter(float("inf")), abandon_on_cancel=False,
        )
    except BaseException:
        with start_lock:
            if not started:
                # Cancellation can win between admission and thread startup.
                # A scheduled-but-not-started worker must then skip the write.
                cancelled_before_start = True
                limiter.release_on_behalf_of(borrower)
        raise
