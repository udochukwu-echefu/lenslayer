"""Real Groq-compatible SDK, entirely in-memory HTTP transports and fake key."""
import asyncio
import json
import os
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import httpx

from backend.app.document_intelligence.analysis import get_llm, get_qa_llm
from backend.app.document_intelligence.adapters import RetainedTextQuestionAnswerer
from backend.app.document_intelligence.qa import QATimings, StreamFailure, StreamFailureCode, count_async_attempt, current_timings


class FakeSSE(httpx.AsyncByteStream):
    def __init__(self):
        self.release = asyncio.Event()
        self.closed = asyncio.Event()

    async def __aiter__(self):
        yield b'data: {"id":"fake","choices":[{"index":0,"delta":{"content":"Notice [Source 1]"}}]}\n\n'
        await self.release.wait()
        yield b'data: {"id":"fake","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
        yield b'data: [DONE]\n\n'

    async def aclose(self):
        self.closed.set()


class QAProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_sdk_requires_explicit_stop_even_after_complete_looking_text(self):
        from langchain_openai import ChatOpenAI

        for reasons in (("stop",), ("length",), (), ("content_filter",), ("unknown",), ("stop", "length")):
            with self.subTest(reasons=reasons):
                class Body(httpx.AsyncByteStream):
                    closed = False

                    async def __aiter__(self):
                        yield b'data: {"id":"fake","choices":[{"index":0,"delta":{"content":"Notice [Source 1]"}}]}\n\n'
                        for reason in reasons:
                            chunk = {"id": "fake", "choices": [{"index": 0, "delta": {}, "finish_reason": reason}]}
                            yield f"data: {json.dumps(chunk)}\n\n".encode()
                        yield b'data: [DONE]\n\n'

                    async def aclose(self):
                        self.closed = True

                body = Body()
                calls = []

                async def handle(request):
                    calls.append(request)
                    return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=body)

                async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
                    model = ChatOpenAI(api_key="synthetic-not-a-credential", base_url="https://fake.invalid/v1",
                                       model="fake", max_retries=2, http_async_client=client)
                    adapter = RetainedTextQuestionAnswerer(lambda: model, lambda: True)
                    iterator = adapter.stream(adapter.prepare("Notice is sixty days.", "What notice?"))
                    self.assertEqual(await anext(iterator), "Notice [Source 1]")
                    if reasons == ("stop",):
                        self.assertEqual([piece async for piece in iterator], [])
                    else:
                        with self.assertRaises(StreamFailure) as failure:
                            async for _ in iterator:
                                pass
                        self.assertEqual(failure.exception.code, StreamFailureCode.PROVIDER_INCOMPLETE)
                    self.assertTrue(body.closed)
                    self.assertEqual(len(calls), 1)

    async def test_real_sdk_pre_response_retry_limit_and_cancellation_close_http_body(self):
        from langchain_openai import ChatOpenAI
        sse = FakeSSE()
        calls = []
        async def handle(request):
            body = json.loads(request.content)
            calls.append(body)
            if len(calls) == 1:
                return httpx.Response(429, headers={"retry-after-ms": "1"}, json={"error": {"message": "synthetic rate limit"}})
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=sse)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle), event_hooks={"request": [count_async_attempt]}) as client:
            model = ChatOpenAI(api_key="synthetic-not-a-credential", base_url="https://fake.invalid/v1", model="fake",
                               max_tokens=1536, max_retries=2, http_async_client=client)
            adapter = RetainedTextQuestionAnswerer(lambda: model, lambda: True)
            prepared = adapter.prepare("Notice is sixty days.", "What notice?")
            timing = QATimings()
            token = current_timings.set(timing)
            iterator = adapter.stream(prepared)
            try:
                self.assertEqual(await anext(iterator), "Notice [Source 1]")
                self.assertFalse(sse.closed.is_set())
                pending = asyncio.create_task(anext(iterator))
                await asyncio.sleep(0)
                pending.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await pending
                await iterator.aclose()
                self.assertTrue(sse.closed.is_set())
                self.assertFalse(sse.release.is_set())
                self.assertEqual(len(calls), 2)
                self.assertEqual(timing.values()["retry_count"], 1)
                self.assertEqual(calls[0].get("max_completion_tokens", calls[0].get("max_tokens")), 1536)
            finally:
                current_timings.reset(token)

    async def test_real_sdk_partial_transport_failure_never_replays_even_after_stop(self):
        from langchain_openai import ChatOpenAI

        for stop_first in (False, True):
            with self.subTest(stop_first=stop_first):
                class BrokenBody(httpx.AsyncByteStream):
                    closed = False

                    async def __aiter__(self):
                        yield b'data: {"id":"fake","choices":[{"index":0,"delta":{"content":"Notice [Source 1]"}}]}\n\n'
                        if stop_first:
                            yield b'data: {"id":"fake","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
                        raise httpx.ReadError("PRIVATE_TRANSPORT_FAILURE")

                    async def aclose(self):
                        self.closed = True

                body = BrokenBody()
                calls = []

                async def handle(request):
                    calls.append(request)
                    return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=body)

                async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
                    model = ChatOpenAI(api_key="synthetic-not-a-credential", base_url="https://fake.invalid/v1",
                                       model="fake", max_retries=2, http_async_client=client)
                    adapter = RetainedTextQuestionAnswerer(lambda: model, lambda: True)
                    iterator = adapter.stream(adapter.prepare("Notice is sixty days.", "What notice?"))
                    self.assertEqual(await anext(iterator), "Notice [Source 1]")
                    with self.assertRaises(StreamFailure) as failure:
                        async for _ in iterator:
                            pass
                    self.assertEqual(str(failure.exception), "provider_incomplete")
                    self.assertTrue(body.closed)
                    self.assertEqual(len(calls), 1)

    async def test_exhausted_sdk_retries_are_not_replayed_by_answerer(self):
        from langchain_openai import ChatOpenAI
        calls = 0
        async def handle(request):
            nonlocal calls
            calls += 1
            return httpx.Response(503, headers={"retry-after-ms": "1"}, json={"error": {"message": "synthetic failure"}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            model = ChatOpenAI(api_key="synthetic-not-a-credential", base_url="https://fake.invalid/v1", model="fake",
                               max_tokens=1536, max_retries=2, http_async_client=client)
            adapter = RetainedTextQuestionAnswerer(lambda: model, lambda: True)
            with self.assertRaises(Exception):
                async for _ in adapter.stream(adapter.prepare("Notice", "What notice?")):
                    self.fail("No content expected")
            self.assertEqual(calls, 3)

    async def test_qa_budget_is_separate_from_full_review_configuration(self):
        # Construction only; neither model has a transport invocation.
        get_llm.cache_clear()
        get_qa_llm.cache_clear()
        with patch.dict(os.environ, {"GROQ_API_KEY": "synthetic-not-a-credential", "GROQ_MAX_TOKENS": "8192"}):
            review, qa = get_llm(), get_qa_llm()
            self.assertEqual(review.max_tokens, 8192)
            self.assertEqual(qa.max_tokens, 1536)
            self.assertEqual((review.max_retries, qa.max_retries), (2, 2))
            self.assertEqual((review.request_timeout, qa.request_timeout), (90, 90))
            review.root_client.close()
            await review.root_async_client.close()
            qa.root_client.close()
            await qa.root_async_client.close()
        get_llm.cache_clear()
        get_qa_llm.cache_clear()


if __name__ == "__main__":
    unittest.main()
