"""Targeted source-audit regressions. Synthetic credentials and local SQLite only."""
import unittest
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import parse_qs

import httpx
from sqlalchemy import select

from backend.app.calendar_connector import CALENDAR_SCOPE, ConnectorError, GoogleCalendarHTTP, decrypt_credentials
from backend.app.calendar_runtime import _usable_tokens
from backend.app.connector_models import CalendarCredential, CalendarOAuthState
from backend.app.models import utcnow
from backend.app.service_domains.agents import digest
from tests import test_calendar_workflows as fixtures


class CalendarTokenLifetimeAuditTests(unittest.TestCase):
    def test_missing_or_positive_refresh_lifetime_remains_supported(self):
        for extra in ({}, {"refresh_token_expires_in": 3600}):
            with self.subTest(extra=extra):
                body = {"access_token": "synthetic-access", "refresh_token": "synthetic-refresh",
                        "token_type": "Bearer", "scope": CALENDAR_SCOPE, "expires_in": 3600, **extra}
                provider = GoogleCalendarHTTP(SimpleNamespace(connector_http_timeout_seconds=5,
                    google_calendar_client_id="synthetic-client", google_calendar_client_secret="synthetic-secret",
                    google_calendar_redirect_uri="https://dashboard.example.test/calendar/oauth-return"),
                    transport=httpx.MockTransport(lambda _: httpx.Response(200, json=body)))
                try:
                    tokens = provider.token(code="synthetic-code")
                    self.assertEqual("refresh_expires_at" in tokens, bool(extra))
                finally:
                    provider.close()

    def test_explicit_invalid_refresh_lifetimes_are_not_treated_as_absent(self):
        for lifetime in (0, False, None, "", [], {}, -1, True, "3600"):
            with self.subTest(lifetime=lifetime):
                body = {"access_token": "synthetic-access", "refresh_token": "synthetic-refresh",
                        "token_type": "Bearer", "scope": CALENDAR_SCOPE, "expires_in": 3600,
                        "refresh_token_expires_in": lifetime}
                provider = GoogleCalendarHTTP(SimpleNamespace(connector_http_timeout_seconds=5,
                    google_calendar_client_id="synthetic-client", google_calendar_client_secret="synthetic-secret",
                    google_calendar_redirect_uri="https://dashboard.example.test/calendar/oauth-return"),
                    transport=httpx.MockTransport(lambda _: httpx.Response(200, json=body)))
                try:
                    with self.assertRaises(ConnectorError) as rejected:
                        provider.token(code="synthetic-code")
                    self.assertEqual(rejected.exception.code, "token_exchange_failed")
                finally:
                    provider.close()


class CalendarOAuthLifecycleAuditTests(unittest.TestCase):
    def setUp(self):
        self.f = fixtures.CalendarWorkflowTests(methodName="runTest")
        self.f.setUp()

    def tearDown(self):
        self.f.tearDown()

    def test_state_window_boundary_rejects_before_exchange_not_google_consent_time(self):
        f = self.f
        for remaining, status in ((timedelta(microseconds=1), 201), (timedelta(0), 409), (timedelta(seconds=-1), 409)):
            with self.subTest(remaining=remaining):
                state = f.oauth_start()
                now = utcnow()
                with f.database.session_factory() as session:
                    row = session.scalar(select(CalendarOAuthState).where(CalendarOAuthState.state_hash == digest(state)))
                    row.expires_at = now + remaining
                    session.commit()
                before = len(f.fake.calls)
                with patch("backend.app.service_domains.calendar.utcnow", return_value=now):
                    response = f.client.post(f.base + "/calendar/oauth/callback", headers=f.alice,
                                             json={"state": state, "code": "synthetic-code"})
                self.assertEqual(response.status_code, status)
                self.assertEqual(len(f.fake.calls) - before, 1 if status == 201 else 0)

    def test_failed_exchange_burns_state_and_cannot_be_replayed_with_new_proof(self):
        f = self.f
        state = f.oauth_start()
        f.fake.token_invalid_json = True
        payload = {"state": state, "code": "synthetic-code"}
        response = f.client.post(f.base + "/calendar/oauth/callback", headers=f.alice, json=payload)
        self.assertEqual(response.status_code, 409)
        f.fake.token_invalid_json = False
        response = f.client.post(f.base + "/calendar/oauth/callback", headers=f.alice, json=payload)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(len(f.fake.calls), 1)
        with f.database.session_factory() as session:
            row = session.scalar(select(CalendarOAuthState).where(CalendarOAuthState.state_hash == digest(state)))
            self.assertIsNotNone(row.consumed_at)
            self.assertEqual(session.scalars(select(CalendarCredential)).all(), [])

    def test_role_loss_during_exchange_cannot_store_an_unauthorized_grant(self):
        f = self.f
        state = f.oauth_start()
        from backend.app.models import Membership

        def handle(request):
            if request.url.path == "/token":
                with f.database.session_factory() as session:
                    membership = session.scalar(select(Membership).where(
                        Membership.organization_id == f.org, Membership.user_id == f.owner))
                    membership.role = "viewer"
                    session.commit()
            return f.fake.handle(request)

        factory = lambda settings: GoogleCalendarHTTP(settings, transport=httpx.MockTransport(handle))
        with patch("backend.app.service_domains.calendar.GoogleCalendarHTTP", factory):
            response = f.client.post(f.base + "/calendar/oauth/callback", headers=f.alice,
                                     json={"state": state, "code": "synthetic-code"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(sum(path.endswith("/token") for _, path in f.fake.calls), 1)
        with f.database.session_factory() as session:
            self.assertEqual(session.scalars(select(CalendarCredential)).all(), [])

    def test_redirect_or_state_key_rotation_invalidates_pending_state_without_exchange(self):
        f = self.f
        for field in ("google_calendar_redirect_uri", "connector_state_signing_key"):
            with self.subTest(field=field):
                state = f.oauth_start()
                original = getattr(f.settings, field)
                setattr(f.settings, field, original + "-rotated")
                try:
                    response = f.client.post(f.base + "/calendar/oauth/callback", headers=f.alice,
                                             json={"state": state, "code": "synthetic-code"})
                    self.assertEqual(response.status_code, 400)
                    self.assertEqual(f.fake.calls, [])
                finally:
                    setattr(f.settings, field, original)

    def test_refresh_omissions_preserve_token_and_deadline_and_persist_revision(self):
        f = self.f
        connection = f.connection()
        from backend.app.calendar_connector import encrypt_credentials
        deadline = (utcnow() + timedelta(hours=2)).isoformat()
        with f.database.session_factory() as session:
            credential = session.get(CalendarCredential, connection["id"])
            tokens = decrypt_credentials(f.settings, credential)
            tokens["refresh_expires_at"] = deadline
            credential.encrypted_json = encrypt_credentials(f.settings, credential.connection_id, f.org, tokens)
            session.commit()
        revision = credential.revision
        f.fake.token_body = {"access_token": "synthetic-refreshed-access", "expires_in": 3600, "token_type": "Bearer"}
        provider = GoogleCalendarHTTP(f.settings, transport=httpx.MockTransport(f.fake.handle))
        try:
            refreshed = _usable_tokens(f.database, f.settings, provider, credential, force_refresh=True)
        finally:
            provider.close()
        self.assertEqual(refreshed["refresh_token"], tokens["refresh_token"])
        self.assertEqual(refreshed["refresh_expires_at"], deadline)
        with f.database.session_factory() as session:
            persisted = session.get(CalendarCredential, connection["id"])
            self.assertEqual(persisted.revision, revision + 1)
            self.assertEqual(decrypt_credentials(f.settings, persisted), refreshed)

    def test_disconnect_during_refresh_cannot_restore_credentials_or_dispatch(self):
        f = self.f
        connection = f.connection()
        with f.database.session_factory() as session:
            credential = session.get(CalendarCredential, connection["id"])

        def handle(request):
            if request.url.path == "/token" and parse_qs(request.content.decode()).get("grant_type") == ["refresh_token"]:
                response = f.client.post(f.base + f"/calendar/connections/{connection['id']}/disconnect", headers=f.alice)
                self.assertEqual(response.status_code, 200)
                self.assertFalse(response.json()["provider_revocation_pending"])
            return f.fake.handle(request)

        provider = GoogleCalendarHTTP(f.settings, transport=httpx.MockTransport(handle))
        try:
            with self.assertRaises(ConnectorError) as rejected:
                _usable_tokens(f.database, f.settings, provider, credential, force_refresh=True)
            self.assertEqual(rejected.exception.code, "credential_changed")
        finally:
            provider.close()
        with f.database.session_factory() as session:
            persisted = session.get(CalendarCredential, connection["id"])
            self.assertIsNotNone(persisted.revoked_at)
            self.assertEqual(persisted.encrypted_json, "")
        self.assertEqual(f.fake.posts, 0)
