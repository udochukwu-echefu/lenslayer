"""Additive NDJSON protocol. Partial text is never an action or completion receipt."""
import asyncio
from dataclasses import asdict
import hashlib
import json
import re
import time
from uuid import uuid4

import anyio
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..document_intelligence.qa import QATimings, current_timings
from ..models import User
from ..schemas import ContractQuestionCreate
from ..security import resolve_principal
from ..services import PlatformService
from ..service_domains.qa import contract_input, fingerprint, portfolio_documents
from .dependencies import UserDep

router = APIRouter()
STREAM_TIMEOUT_SECONDS = 120
HEARTBEAT_SECONDS = 10


def operation(request, organization_id, contract_id, user_id, question, prepared=None, result=None):
    """Each bounded sync unit owns its session in one worker thread."""
    principal = resolve_principal(request)  # Includes JWT expiry, including at final.
    with request.app.state.database.session_factory() as session:
        service = PlatformService(session, request.app.state.settings, request.app.state.object_store,
                                  request.app.state.review_workflow)
        user = session.get(User, user_id)
        if user is None or user.external_subject != principal.subject:
            raise HTTPException(status_code=401, detail="Sign in to continue.")
        service.workspace.membership(organization_id, user)  # Fresh revocation check.
        if contract_id:
            text, context = contract_input(service, organization_id, contract_id, user)
            snapshot = hashlib.sha256((text + json.dumps(context, sort_keys=True)).encode()).hexdigest()
            if prepared is None:
                adapter, answer = service.review_workflow.prepare_contract_answer(text, question, context)
        else:
            documents = portfolio_documents(service, organization_id, user, question)
            snapshot = fingerprint(documents)
            if prepared is None:
                adapter, answer = service.review_workflow.prepare_portfolio_answer(documents, question)
        if prepared is None:
            return adapter, answer, snapshot
        if prepared[2] != snapshot:
            raise HTTPException(status_code=409, detail="Evidence changed or expired. Ask again.")
        if result is not None:
            service._audit(organization_id, user.id,
                           "review.question_answered" if contract_id else "portfolio.question_answered",
                           contract_id, {"request_id": result["request_id"], "source_count": len(result["sources"]),
                                         "generated_by": result["generated_by"], "streamed": True})
            session.commit()


async def response(request, organization_id, contract_id, user_id, question):
    timing = QATimings()
    # Authenticate/retrieve before headers; authorization failures stay ordinary HTTP.
    try:
        prepared = await anyio.to_thread.run_sync(operation, request, organization_id, contract_id, user_id, question)
    except HTTPException as exc:
        timing.record("denied_before_headers")
        exc.headers = {**(exc.headers or {}), "Cache-Control": "private, no-store"}
        raise
    timing.retrieval_ms = (time.monotonic() - timing.started) * 1000
    adapter, answer, _ = prepared
    request_id = str(uuid4())

    async def events():
        token = current_timings.set(timing)
        seq = 0
        outcome = "interrupted"
        iterator = None
        pending = None

        def frame(type, **data):
            nonlocal seq
            seq += 1
            return (json.dumps(dict(type=type, request_id=request_id, seq=seq, **data), ensure_ascii=False) + "\n").encode()

        async def check(result=None):
            await anyio.to_thread.run_sync(operation, request, organization_id, contract_id, user_id,
                                          question, prepared, result)

        try:
            async with asyncio.timeout(STREAM_TIMEOUT_SECONDS):
                await check()
                yield frame("status", phase="generating", provisional=True)
                sources = [asdict(source) for source in answer.result.sources]
                yield frame("evidence", sources=sources, provisional=True)
                pieces = []
                size = 0
                iterator = adapter.stream(answer)
                last_check = time.monotonic()
                while True:
                    pending = asyncio.create_task(anext(iterator))
                    while not pending.done():
                        done, _ = await asyncio.wait({pending}, timeout=HEARTBEAT_SECONDS)
                        if not done:
                            await check()
                            last_check = time.monotonic()
                            yield frame("status", phase="generating", provisional=True)
                    try:
                        piece = pending.result()
                    except StopAsyncIteration:
                        break
                    if time.monotonic() - last_check >= 2:
                        await check()
                        last_check = time.monotonic()
                    size += len(piece)
                    if size > 32_000:
                        raise ValueError("Answer exceeds Q&A bound")
                    pieces.append(piece)
                    yield frame("answer", delta=piece, provisional=True)
                text = "".join(pieces).strip()
                if answer.result.generated_by == "model":
                    citations = set(re.findall(r"\[Source (\d+)\]", text))
                    allowed = {str(i) for i in range(1, len(sources) + 1)}
                    if not citations or not citations <= allowed:
                        raise ValueError("Missing or invalid source citations")
                if not text:
                    raise ValueError("Empty answer")
                result = dict(answer=text, sources=sources, generated_by=answer.result.generated_by,
                              request_id=request_id)
                await asyncio.sleep(0)  # Cancellation checkpoint before final-only audit.
                await check(result)
                outcome = "complete"
                yield frame("final", completed=True, provisional=False, result=result, timings=timing.values())
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            outcome = "failed"
            code = "timeout" if isinstance(exc, TimeoutError) else "evidence_or_access_changed" if isinstance(exc, HTTPException) else "generation_failed"
            # Never forward provider exception content, prompts or credentials.
            yield frame("error", code=code, message="Answer incomplete. Please try again.", provisional=True)
            yield frame("final", completed=False, provisional=True, timings=timing.values())
        finally:
            with anyio.CancelScope(shield=True):
                if pending is not None and not pending.done():
                    pending.cancel()
                    await asyncio.gather(pending, return_exceptions=True)
                if iterator is not None:
                    await iterator.aclose()
            timing.record(outcome)
            current_timings.reset(token)

    return StreamingResponse(events(), media_type="application/x-ndjson", headers={
        "Cache-Control": "private, no-store", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff",
        "X-Request-ID": request_id,
    })


@router.post("/organizations/{organization_id}/contracts/{contract_id}/questions/stream", tags=["reviews"])
async def contract_stream(organization_id: str, contract_id: str, request: Request,
                          payload: ContractQuestionCreate, user: UserDep):
    return await response(request, organization_id, contract_id, user.id, payload.question)


@router.post("/organizations/{organization_id}/portfolio/questions/stream", tags=["governance"])
async def portfolio_stream(organization_id: str, request: Request, payload: ContractQuestionCreate, user: UserDep):
    return await response(request, organization_id, None, user.id, payload.question)
