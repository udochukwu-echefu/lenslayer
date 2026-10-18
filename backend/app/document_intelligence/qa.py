"""Document Q&A only: bounded generation and content-free request measurements."""
from contextvars import ContextVar
from dataclasses import dataclass, field
import logging
import time

from .ports import QAResult

logger = logging.getLogger(__name__)
current_timings: ContextVar["QATimings | None"] = ContextVar("qa_timings", default=None)


@dataclass
class QATimings:
    started: float = field(default_factory=time.monotonic)
    retrieval_ms: float = 0
    provider_ms: float = 0
    first_content_ms: float | None = None
    queue_ms: float | None = None  # Unknown unless explicitly returned by provider.
    attempts: int = 0

    def content(self):
        if self.first_content_ms is None:
            self.first_content_ms = (time.monotonic() - self.started) * 1000

    def metadata(self, metadata):
        usage = (metadata or {}).get("token_usage", {})
        if isinstance(usage, dict) and isinstance(usage.get("queue_time"), (int, float)):
            self.queue_ms = usage["queue_time"] * 1000

    def values(self):
        return dict(retrieval_ms=round(self.retrieval_ms, 2), provider_ms=round(self.provider_ms, 2),
                    first_content_ms=None if self.first_content_ms is None else round(self.first_content_ms, 2),
                    total_ms=round((time.monotonic() - self.started) * 1000, 2),
                    retry_count=max(0, self.attempts - 1), queue_ms=self.queue_ms)

    def record(self, outcome):
        # Deliberately no request inputs, source IDs, exception strings or outputs.
        logger.info("document_qa_timing", extra={"qa_timing": {**self.values(), "outcome": outcome}})


def count_attempt(request):
    timing = current_timings.get()
    if timing is not None:
        timing.attempts += 1


async def count_async_attempt(request):
    count_attempt(request)


@dataclass(frozen=True)
class PreparedAnswer:
    result: QAResult
    prompt: str = ""


def complete(adapter, prepared):
    timing = current_timings.get()
    if not prepared.prompt:
        if timing:
            timing.content()
        return prepared.result
    started = time.monotonic()
    try:
        message = adapter.model().invoke(prepared.prompt)
        if timing:
            timing.content()
            timing.metadata(getattr(message, "response_metadata", {}))
        return QAResult(str(message.content).strip(), prepared.result.sources, "model")
    finally:
        if timing:
            timing.provider_ms += (time.monotonic() - started) * 1000


async def stream(adapter, prepared):
    """No replay/retry after partial output. SDK handles pre-response retries only."""
    timing = current_timings.get()
    if not prepared.prompt:
        if prepared.result.answer:
            if timing:
                timing.content()
            yield prepared.result.answer
        return
    started = time.monotonic()
    iterator = adapter.model().astream(prepared.prompt)
    try:
        async for message in iterator:
            if timing:
                timing.metadata(getattr(message, "response_metadata", {}))
            if getattr(message, "response_metadata", {}).get("finish_reason") in {"length", "content_filter"}:
                raise ValueError("Incomplete provider answer")
            content = message.content
            if not isinstance(content, str):
                raise ValueError("Unexpected model content format")
            if content:
                if timing:
                    timing.content()
                yield content
    finally:
        await iterator.aclose()
        if timing:
            timing.provider_ms += (time.monotonic() - started) * 1000
