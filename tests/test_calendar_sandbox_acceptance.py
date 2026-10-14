"""Disposable local API/SQLite harness, with ALL Google HTTP replaced. Not live proof."""
import io
import copy
import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse, urlencode
from contextlib import redirect_stdout

import httpx

from backend.app.calendar_connector import GoogleCalendarHTTP
from backend.app.calendar_sandbox import _SandboxSettings, run_sandbox
from backend.app.calendar_sandbox_acceptance import CalendarAcceptanceInspector, callback_payload
from tests.test_calendar_workflows import FakeGoogle

CALENDAR = "disposable@group.calendar.google.com"
REDIRECT = "http://localhost:3000/calendar/oauth-return"


class CalendarInspectorTests(unittest.TestCase):
    def test_harness_settings_ignore_ambient_product_cloud_and_secret_sources(self):
        env = {"LENSLAYER_PLATFORM_HOSTED_MODEL_API_KEY": "fake-ambient-product-secret",
            "LENSLAYER_PLATFORM_HOSTED_MODEL_ENABLED": "true", "LENSLAYER_PLATFORM_OBJECT_STORAGE_BACKEND": "s3",
            "LENSLAYER_PLATFORM_AGENT_WORKER_MODE": "on_demand"}
        with patch.dict(os.environ, env, clear=True):
            settings = _SandboxSettings(_env_file=None)
        self.assertEqual(settings.hosted_model_api_key, "")
        self.assertFalse(settings.hosted_model_enabled)
        self.assertEqual(settings.object_storage_backend, "local")
        self.assertEqual(settings.agent_worker_mode, "continuous")

    def inspector(self, body, status=200):
        settings = SimpleNamespace(connector_http_timeout_seconds=10)
        return CalendarAcceptanceInspector(settings, "fake-readonly-token",
            transport=httpx.MockTransport(lambda _: httpx.Response(status, json=body)))

    def test_callback_checks_actual_returned_state_redirect_errors_and_duplicate_parameters(self):
        returned = REDIRECT + "?code=fake&state=expected"
        self.assertEqual(callback_payload(returned, REDIRECT, "expected"), {"code": "fake", "state": "expected"})
        for url in (returned.replace("expected", "attacker"), returned.replace("localhost", "attacker.test"),
                    returned + "&state=expected", returned + "&code=second", returned + "#fragment",
                    REDIRECT + "?error=access_denied&state=expected", REDIRECT + "?code=&state=expected"):
            with self.subTest(url=url), self.assertRaisesRegex(ValueError, "redirect/state"):
                callback_payload(url, REDIRECT, "expected")

    def test_ownership_is_provider_proven_not_a_suffix_or_shared_calendar(self):
        for mutation in ({}, {"primary": True}, {"primary": "false"}, {"accessRole": "writer"}, {"accessRole": "reader"},
                         {"id": "other@group.calendar.google.com"}, {"deleted": True}):
            body = {"id": CALENDAR, "accessRole": "owner", **mutation}
            inspector = self.inspector(body)
            try:
                if not mutation:
                    inspector.owned_secondary(CALENDAR)
                else:
                    with self.assertRaises(ValueError):
                        inspector.owned_secondary(CALENDAR)
            finally:
                inspector.close()

    def test_empty_then_exact_one_no_pagination_and_redirect_does_not_pass(self):
        for body, count, event_id, valid in (({"items": []}, 0, None, True),
                ({"items": [{"id": "stable"}]}, 1, "stable", True),
                ({"items": [{"id": "other"}]}, 1, "stable", False),
                ({"items": [], "nextPageToken": "more"}, 0, None, False),
                ({"items": [{"id": "stable"}, {"id": "another"}]}, 1, "stable", False), ({}, 0, None, False)):
            inspector = self.inspector(body)
            try:
                if valid:
                    inspector.exact_count(CALENDAR, count, event_id)
                else:
                    with self.assertRaises(ValueError):
                        inspector.exact_count(CALENDAR, count, event_id)
            finally:
                inspector.close()
        inspector = self.inspector({"items": []}, 302)
        try:
            with self.assertRaises(ValueError):
                inspector.exact_count(CALENDAR, 0)
        finally:
            inspector.close()

    def test_independent_get_rejects_attendees_recurrence_public_and_changed_provenance(self):
        expected = {"id": "ll" + "a" * 32, "summary": "Synthetic", "description": "", "visibility": "private",
            "status": "confirmed", "reminders": {"useDefault": False}, "extendedProperties": {"private": {"lenslayer_input": "fixed-hash"}},
            "start": {"dateTime": "2026-12-01T09:00:00+00:00"}, "end": {"dateTime": "2026-12-01T09:15:00+00:00"}}
        for mutation in ({}, {"attendees": [{"email": "attacker@example.test"}]}, {"recurrence": ["RRULE:FREQ=DAILY"]},
                         {"visibility": "public"}, {"extendedProperties": {"private": {"lenslayer_input": "changed"}}},
                         {"id": "different"}, {"conferenceData": {"conferenceId": "unsafe"}}):
            actual = {**copy.deepcopy(expected), **mutation}
            def handle(request):
                return httpx.Response(200, json={"items": [actual]} if request.url.path.endswith("/events") else actual)
            inspector = CalendarAcceptanceInspector(SimpleNamespace(connector_http_timeout_seconds=10), "fake-readonly",
                transport=httpx.MockTransport(handle))
            try:
                if not mutation:
                    inspector.verify_event(CALENDAR, expected)
                else:
                    with self.assertRaises(ValueError):
                        inspector.verify_event(CALENDAR, expected)
            finally:
                inspector.close()


class CalendarLocalHarnessTests(unittest.TestCase):
    def run_fake(self, *, approve=True, uncertain=False, owner=True):
        fake = FakeGoogle()
        fake.unreadable_after_write = uncertain
        output = io.StringIO()
        inspector_calls = []
        def inspect(request):
            inspector_calls.append((request.method, request.url.path))
            self.assertEqual(request.method, "GET")
            if "/calendarList/" in request.url.path:
                return httpx.Response(200, json={"id": CALENDAR, "accessRole": "owner" if owner else "writer"})
            if request.url.path.endswith("/events"):
                return httpx.Response(200, json={"items": list(fake.events.values())})
            return fake.handle(request)
        def hidden(prompt):
            if "inspection" in prompt:
                return "fake-readonly-token"
            url = [line for line in output.getvalue().splitlines() if line.startswith("https://accounts.google.com/")][-1]
            state = parse_qs(urlparse(url).query)["state"][0]
            return REDIRECT + "?" + urlencode({"code": "fake-code", "state": state})
        factory = lambda settings: GoogleCalendarHTTP(settings, transport=httpx.MockTransport(fake.handle))
        factory.verify = GoogleCalendarHTTP.verify  # constructor replacement preserves the runtime's static completion check
        inspector_factory = lambda settings, token: CalendarAcceptanceInspector(settings, token, transport=httpx.MockTransport(inspect))
        env = {"LENSLAYER_SANDBOX_GOOGLE_ACK": "write_one_event_to_disposable_calendar",
            "LENSLAYER_SANDBOX_GOOGLE_CALENDAR_ID": CALENDAR, "LENSLAYER_SANDBOX_GOOGLE_CLIENT_ID": "fake-client",
            "LENSLAYER_SANDBOX_GOOGLE_CLIENT_SECRET": "fake-client-secret", "LENSLAYER_SANDBOX_GOOGLE_REDIRECT_URI": REDIRECT}
        error = None
        with patch.dict(os.environ, env, clear=True), redirect_stdout(output), \
                patch("backend.app.calendar_sandbox.getpass.getpass", hidden), \
                patch("builtins.input", return_value="APPROVE DISPOSABLE EVENT" if approve else "NO"), \
                patch("backend.app.calendar_sandbox.CalendarAcceptanceInspector", inspector_factory), \
                patch("backend.app.service_domains.calendar.GoogleCalendarHTTP", factory), \
                patch("backend.app.calendar_runtime.GoogleCalendarHTTP", factory), \
                patch("backend.app.calendar_connector.GoogleCalendarHTTP", factory):
            try:
                run_sandbox()
            except ValueError as exc:
                error = exc
        return fake, inspector_calls, output.getvalue(), error

    def test_entire_disposable_harness_one_private_event_refresh_disconnect_reconnect_get_only(self):
        fake, reads, output, error = self.run_fake()
        self.assertIsNone(error)
        self.assertEqual(fake.posts, 1)
        self.assertEqual(len(fake.events), 1)
        event = next(iter(fake.events.values()))
        self.assertEqual(event["visibility"], "private")
        self.assertRegex(event["id"], r"^ll[0-9a-f]{32}$")
        for field in ("attendees", "recurrence", "conferenceData"):
            self.assertNotIn(field, event)
        self.assertEqual(sum(path.endswith("/token") for _, path in fake.calls), 3)  # consent, refresh, new consent
        self.assertEqual(sum(path.endswith("/revoke") for _, path in fake.calls), 2)
        self.assertGreaterEqual(sum(path.endswith("/events/" + event["id"]) for _, path in reads), 2)
        self.assertIn('"refresh_verified": true', output)
        self.assertIn('"production_session_binding_verified": false', output)
        for secret in ("fake-client-secret", "fake-access-secret", "fake-refresh-secret", "fake-readonly-token"):
            self.assertNotIn(secret, output)

    def test_human_denial_and_nonowner_make_no_writes(self):
        for kwargs in ({"approve": False}, {"owner": False}):
            fake, _, output, error = self.run_fake(**kwargs)
            self.assertIsNotNone(error)
            self.assertEqual(fake.posts, 0)
            self.assertNotIn('"calendar_live_checks_passed": true', output)

    def test_uncertain_post_is_not_repeated_or_reported_as_acceptance(self):
        fake, _, output, error = self.run_fake(uncertain=True)
        self.assertIsNotNone(error)
        self.assertEqual(fake.posts, 1)
        self.assertNotIn('"calendar_live_checks_passed": true', output)
