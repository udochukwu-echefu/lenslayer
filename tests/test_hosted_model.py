"""Bounded optional product adapter. Every HTTP request uses MockTransport."""
import json
import unittest
from datetime import timedelta
from unittest.mock import patch

import httpx
from pydantic import ValidationError

from backend.app.config import Settings
from backend.app.hosted_agent_model import MODEL, MODEL_URL, HostedModelError, decide
from backend.app.hosted_agent_schemas import HostedTaskCreate
from backend.app.models import utcnow


class HostedModelTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(_env_file=None, hosted_model_enabled=True, hosted_model_api_key="fake-product-secret")
        self.request = HostedTaskCreate(idempotency_key="fake", goal_type="calendar-event", goal="Fixed human plan",
            deadline_at=utcnow() + timedelta(hours=1), calendar={"connection_id": "fake", "calendar_id": "fake@example.test",
            "summary": "Exact summary", "start_at": "2026-12-01T09:00:00Z", "end_at": "2026-12-01T10:00:00Z"})

    def response(self, **overrides):
        return {"model": MODEL, "status": "completed", "output": [{"type": "message", "role": "assistant", "status": "completed",
            "content": [{"type": "output_text", "text": '{"decision":"proceed"}'}]}], **overrides}

    def reject(self, response, code="model_response_invalid"):
        with self.assertRaises(HostedModelError) as error:
            decide(self.settings, self.request, "", transport=httpx.MockTransport(lambda _: response))
        self.assertEqual(str(error.exception), code)
        self.assertNotIn("fake-product-secret", str(error.exception))

    def test_fixed_endpoint_bounded_excerpt_and_decision_only_wire_contract(self):
        requests = []
        def handle(request):
            requests.append(request)
            self.assertEqual(str(request.url), MODEL_URL)
            self.assertEqual(request.method, "POST")
            self.assertEqual(request.headers["authorization"], "Bearer fake-product-secret")
            body = json.loads(request.content)
            self.assertEqual(body["model"], MODEL)
            self.assertEqual(body["reasoning"], {"effort": "high"})
            self.assertEqual(body["max_output_tokens"], 2048)
            self.assertFalse(body["store"])
            self.assertNotIn("tools", body)
            self.assertEqual(len(json.loads(body["input"])["untrusted_retained_excerpt"]), 1000)
            self.assertTrue(body["text"]["format"]["strict"])
            return httpx.Response(200, json=self.response())
        self.assertEqual(decide(self.settings, self.request, "x" * 5000, transport=httpx.MockTransport(handle)).decision, "proceed")
        self.assertEqual(len(requests), 1)

    def test_wrong_model_incomplete_arbitrary_tools_and_invalid_shapes_fail_closed(self):
        bodies = [self.response(model="other"), self.response(status="incomplete"), {}, None, [],
            self.response(output=[]), self.response(output=[{"type": "function_call", "name": "unsafe"}]),
            self.response(output=[{"type": "message", "role": "user", "status": "completed", "content": []}]),
            self.response(output=[{"type": "message", "role": "assistant", "status": "completed", "content": [None]}]),
            self.response(output=[{"type": "message", "role": "assistant", "status": "completed", "content": [
                {"type": "output_text", "text": '{"decision":"proceed","arbitrary":"tool"}'}]}])]
        for body in bodies:
            with self.subTest(body=body):
                self.reject(httpx.Response(200, content=json.dumps(body)))

    def test_http_errors_redirects_timeouts_and_oversize_are_safe_without_retry(self):
        for status in (302, 401, 429, 500):
            self.reject(httpx.Response(status, headers={"location": "https://attacker.test"}, text="raw secret provider error"), "model_request_failed")
        self.reject(httpx.Response(200, content=b"x" * 65537))
        calls = []
        def timeout(request):
            calls.append(request)
            raise httpx.ReadTimeout("raw-secret-provider-error", request=request)
        with self.assertRaises(HostedModelError) as error:
            decide(self.settings, self.request, "", transport=httpx.MockTransport(timeout))
        self.assertEqual(str(error.exception), "model_outcome_unknown")
        self.assertEqual(len(calls), 1)

    def test_disabled_model_never_calls_http_and_settings_hide_key(self):
        self.settings.hosted_model_enabled = False
        with self.assertRaises(HostedModelError) as error:
            decide(self.settings, self.request, "", transport=httpx.MockTransport(lambda _: self.fail("No HTTP without access")))
        self.assertEqual(str(error.exception), "model_unavailable")
        self.assertNotIn("fake-product-secret", repr(self.settings))
        with self.assertRaises(ValidationError):
            Settings(_env_file=None, hosted_agent_lease_seconds=60, hosted_model_timeout_seconds=30)

    def test_reasoning_is_discarded_and_slow_stream_is_bounded(self):
        body = self.response()
        body["output"].insert(0, {"type": "reasoning", "summary": "private reasoning never checkpointed"})
        decision = decide(self.settings, self.request, "", transport=httpx.MockTransport(lambda _: httpx.Response(200, json=body)))
        self.assertEqual(decision.model_dump(), {"decision": "proceed"})
        with patch("backend.app.hosted_agent_model.time.monotonic", side_effect=[0, 61]):
            self.reject(httpx.Response(200, json=self.response()))
