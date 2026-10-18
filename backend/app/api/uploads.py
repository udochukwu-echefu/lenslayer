"""Bounded execution for blocking upload units, not request-scoped ORM objects."""
from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import CancelledError
from threading import Lock
from typing import TypeVar

import anyio
from fastapi import HTTPException, Request
from fastapi.routing import APIRoute
from pydantic import BaseModel
from starlette.formparsers import MultiPartException, MultiPartParser

from ..services import PlatformService


T = TypeVar("T", bound=BaseModel)


def upload_limiter(request):
    state = request.app.state
    if not hasattr(state, "upload_limiter"):
        state.upload_limiter = anyio.CapacityLimiter(state.settings.upload_concurrency)
    return state.upload_limiter


def authorize_upload(request):
    """Short pre-parse check, closed before waiting; execution rechecks access."""
    from .dependencies import get_current_user, public_api_token
    with request.app.state.database.session_factory(info={"upload_preflight": True}) as session:
        service = PlatformService(session, request.app.state.settings, request.app.state.object_store,
                                  request.app.state.review_workflow)
        if request.url.path.endswith("/public/contracts"):
            service.authenticate_api_key(public_api_token(request), "contracts:write")
        else:
            user = get_current_user(request, service)
            service.require_roles(request.path_params["organization_id"], user, {"owner", "admin", "reviewer"}, "Upload permission required.")
            if contract_id := request.path_params.get("contract_id"):
                from ..source_retention import require_source_available
                require_source_available(service.get_contract(request.path_params["organization_id"], contract_id, user))


class UploadRoute(APIRoute):
    """Admission before FastAPI multipart parsing, only on the six upload actions.

    A fixed per-process backlog of twice capacity waits without consuming bodies.
    Excess requests get 503/Retry-After. Each admitted request owns its parse/spool,
    endpoint bytes and blocking write slot until cleanup. Not a network/proxy
    connection cap; the ASGI server still supplies transport backpressure.
    """
    def get_route_handler(self):
        handler = super().get_route_handler()
        names = {"create_contract", "intake_forwarded_email", "import_google_drive_file", "import_provider_file", "public_api_upload_contract", "upload_contract_version"}
        if self.endpoint.__name__ not in names:
            return handler

        async def admitted(request):
            await anyio.to_thread.run_sync(authorize_upload, request)
            limiter = upload_limiter(request)
            if limiter.statistics().tasks_waiting >= 2 * limiter.total_tokens:
                raise HTTPException(503, "Upload capacity is busy. Try again later.", headers={"Retry-After": "2"})
            borrower = object()
            await limiter.acquire_on_behalf_of(borrower)
            admission = {"borrower": borrower, "transferred": False}
            request.state.upload_admission = admission
            parser = None
            try:
                # Parse only after admission. Explicit ownership also closes
                # partially-created spools on raw task cancellation/disconnect,
                # before Starlette can return a FormData to FastAPI's exit stack.
                if request.headers.get("content-type", "").lower().startswith("multipart/form-data"):
                    maximum = request.app.state.settings.max_upload_bytes + 256 * 1024
                    async def bounded_stream():
                        total = 0
                        async for chunk in request.stream():
                            total += len(chunk)
                            if total > maximum:
                                raise HTTPException(413, "The uploaded document exceeds the request limit.")
                            yield chunk
                    parser = MultiPartParser(request.headers, bounded_stream(), max_files=1, max_fields=32, max_part_size=64 * 1024)
                    try:
                        request._form = await parser.parse()
                    except MultiPartException as exc:
                        raise HTTPException(400, str(exc)) from None
                return await handler(request)
            finally:
                if parser is not None:
                    # All these are SpooledTemporaryFiles, not request ORM state.
                    for file in parser._files_to_close_on_error:
                        file.close()
                if not admission["transferred"]:
                    limiter.release_on_behalf_of(borrower)
        return admitted


async def run_upload(request: Request, operation: Callable[[PlatformService], T]) -> T:
    """Create, use and close the session in one worker; return only serialized data.

    Callbacks must resolve identity and serialize their response here, and must not
    capture a request dependency's session, service or ORM user. The separate
    limiter leaves FastAPI's ordinary sync reads/dependencies free to run.
    """
    state = request.app.state
    # Initialized on the app's event loop, without an intervening await. Never
    # share a limiter across app instances (or create a session while queued).
    limiter = upload_limiter(request)
    admission = getattr(request.state, "upload_admission", None)
    borrower = admission["borrower"] if admission else object()
    if admission:
        admission["transferred"] = True
    else:
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
