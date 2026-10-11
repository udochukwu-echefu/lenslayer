"""Fixed-endpoint Google REST adapter. Never expose provider error bodies/tokens.

Network calls are bounded and run only after the caller closes its transaction.
An uncertain insert is reconciled by GET, never retried with another event ID.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlparse

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException

from .config import Settings
from .models import utcnow

CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
EVENT_BASE = "https://www.googleapis.com/calendar/v3/calendars/"


class ConnectorError(Exception):
    def __init__(self, code: str, *, uncertain: bool = False):
        self.code, self.uncertain = code, uncertain
        super().__init__(code)


def require_connector_config(settings: Settings) -> Fernet:
    uri = urlparse(settings.google_calendar_redirect_uri)
    valid_uri = (uri.scheme == "https" or (
        settings.environment in {"local", "test"} and uri.scheme == "http" and uri.hostname in {"localhost", "127.0.0.1"}
    )) and uri.hostname and not uri.fragment and not uri.username and not uri.query
    if not all((settings.google_calendar_client_id, settings.google_calendar_client_secret,
                valid_uri, len(settings.connector_state_signing_key) >= 32)):
        raise HTTPException(503, "Calendar OAuth is not configured.")
    try:
        return Fernet(settings.connector_encryption_key.encode())
    except (ValueError, TypeError):
        raise HTTPException(503, "Connector encryption is not configured.") from None


def encrypt_credentials(settings, connection_id, organization_id, tokens):
    bound = {"connection_id": connection_id, "organization_id": organization_id,
             "client_id": settings.google_calendar_client_id, "tokens": tokens}
    return require_connector_config(settings).encrypt(json.dumps(bound).encode()).decode()


def decrypt_credentials(settings, credential):
    try:
        bound = json.loads(require_connector_config(settings).decrypt(credential.encrypted_json.encode()))
        if (bound["connection_id"] != credential.connection_id or bound["organization_id"] != credential.organization_id
                or bound["client_id"] != settings.google_calendar_client_id):
            raise ValueError()
        return bound["tokens"]
    except (InvalidToken, ValueError, KeyError, TypeError):
        raise ConnectorError("credential_unavailable") from None


class GoogleCalendarHTTP:
    def __init__(self, settings: Settings, transport=None):
        self.settings = settings
        self.client = httpx.Client(timeout=settings.connector_http_timeout_seconds,
                                   follow_redirects=False, transport=transport, trust_env=False)

    def close(self):
        self.client.close()

    def _request(self, method, url, **kwargs):
        started = time.monotonic()
        chunks, size = [], 0
        with self.client.stream(method, url, **kwargs) as response:
            for chunk in response.iter_bytes(chunk_size=8192):
                size += len(chunk)
                if size > 65536 or time.monotonic() - started > self.settings.connector_http_timeout_seconds * 4:
                    raise ConnectorError("provider_response_invalid", uncertain=True)
                chunks.append(chunk)
            return httpx.Response(response.status_code, content=b"".join(chunks), request=response.request)

    def token(self, *, code=None, refresh_token=None):
        data = {"client_id": self.settings.google_calendar_client_id,
                "client_secret": self.settings.google_calendar_client_secret}
        if code:
            data.update(grant_type="authorization_code", code=code, redirect_uri=self.settings.google_calendar_redirect_uri)
        else:
            data.update(grant_type="refresh_token", refresh_token=refresh_token)
        try:
            response = self._request("POST", TOKEN_URL, data=data)
            body = response.json()
            if not isinstance(body, dict):
                raise ConnectorError("token_exchange_failed")
            if response.status_code != 200:
                raise ConnectorError("credential_revoked" if body.get("error") == "invalid_grant" else "token_exchange_failed")
            scope = body.get("scope", CALENDAR_SCOPE if refresh_token else "")
            if not isinstance(scope, str) or set(scope.split()) != {CALENDAR_SCOPE}:
                raise ConnectorError("scope_changed")
            if body.get("token_type") != "Bearer" or not isinstance(body.get("access_token"), str) or not body["access_token"]:
                raise ConnectorError("token_exchange_failed")
            refresh = body.get("refresh_token", refresh_token)
            if not isinstance(refresh, str) or not refresh:
                raise ConnectorError("refresh_token_missing")
            expires = body["expires_in"]
            if type(expires) is not int or not 0 < expires <= 86400:
                raise ValueError()
            result = {"access_token": body["access_token"], "refresh_token": refresh,
                      "expires_at": (utcnow() + timedelta(seconds=expires)).isoformat()}
            if body.get("refresh_token_expires_in"):
                lifetime = body["refresh_token_expires_in"]
                if type(lifetime) is not int or not 0 < lifetime <= 10 * 365 * 86400:
                    raise ValueError()
                result["refresh_expires_at"] = (utcnow() + timedelta(seconds=lifetime)).isoformat()
            return result
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            raise ConnectorError("token_exchange_failed") from None

    def revoke(self, token):
        try:
            return self._request("POST", REVOKE_URL, data={"token": token}).status_code == 200
        except (httpx.HTTPError, ConnectorError):
            return False

    def get_event(self, calendar_id, event_id, token):
        url = EVENT_BASE + quote(calendar_id, safe="") + "/events/" + quote(event_id, safe="")
        try:
            response = self._request("GET", url, headers={"Authorization": "Bearer " + token})
            if response.status_code == 404:
                return None
            if response.status_code == 401:
                raise ConnectorError("access_token_rejected", uncertain=True)
            if response.status_code != 200:
                raise ConnectorError("provider_read_failed", uncertain=True)
            event = response.json()
            if not isinstance(event, dict):
                raise ConnectorError("provider_response_invalid", uncertain=True)
            return event
        except httpx.HTTPError:
            raise ConnectorError("provider_read_failed", uncertain=True) from None
        except ValueError:
            raise ConnectorError("provider_response_invalid", uncertain=True) from None

    def create_and_read(self, calendar_id, body, token, *, reconcile_only=False, before_write=None, completion_check=None):
        verify = completion_check or self.verify
        existing = self.get_event(calendar_id, body["id"], token)
        if existing is not None:
            return verify(existing, body)
        if reconcile_only:
            # 404 can mean no access or eventual consistency, not proof of no write.
            raise ConnectorError("unknown_outcome", uncertain=True)
        if before_write is not None:
            before_write()
        try:
            response = self._request("POST", EVENT_BASE + quote(calendar_id, safe="") + "/events",
                                        headers={"Authorization": "Bearer " + token},
                                        params={"sendUpdates": "none"}, json=body)
            if response.status_code == 401:
                raise ConnectorError("access_token_rejected")
            if response.status_code not in {200, 201, 409}:
                if response.status_code < 500 and response.status_code != 429:
                    raise ConnectorError("provider_write_rejected")
                # 5xx/429 may conceal an applied write. Only GET can prove success.
        except httpx.HTTPError:
            pass
        actual = self.get_event(calendar_id, body["id"], token)
        if actual is None:
            raise ConnectorError("unknown_outcome", uncertain=True)
        return verify(actual, body)

    @staticmethod
    def verify(actual, expected):
        try:
            if not isinstance(actual, dict):
                raise ValueError()
            times = {}
            for name in ("start", "end"):
                if not isinstance(actual.get(name), dict) or not isinstance(actual[name].get("dateTime"), str):
                    raise ValueError()
                value = datetime.fromisoformat(actual[name]["dateTime"].replace("Z", "+00:00"))
                if value.tzinfo is None or value.utcoffset() is None:
                    raise ValueError()  # never infer the worker's local timezone
                times[name] = value.astimezone(timezone.utc)
            verified = (actual["id"] == expected["id"] and actual.get("status") == "confirmed"
                        and actual.get("summary", "") == expected["summary"]
                        and actual.get("description", "") == expected["description"]
                        and actual.get("extendedProperties", {}).get("private", {}) == expected["extendedProperties"]["private"]
                        and actual.get("visibility") == expected["visibility"]
                        and actual.get("reminders") == expected["reminders"]
                        and not any(actual.get(k) for k in ("recurrence", "attendees", "conferenceData", "attachments"))
                        and all(times[k] == datetime.fromisoformat(expected[k]["dateTime"]) for k in ("start", "end")))
        except (ValueError, TypeError, KeyError, AttributeError):
            verified = False
        if not verified:
            raise ConnectorError("provider_event_conflict")
        return {"event_id": expected["id"], "verified": True, "verification_method": "google_events_get",
                "verified_at": utcnow().isoformat()}
