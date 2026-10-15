"""Explicit coordinator callable; no configuration, credential-store or CLI loading.

Provider event traffic is GET-only. The sole permitted persistence is the existing
runtime's natural-refresh CAS, including a rotated refresh token. Never dispatch
an action, force expiry, retry a rejected token, or disconnect either connection.
"""
import hashlib
import json
import time
from datetime import datetime, timezone

NEW = "75a57c6d-2b10-4b25-9a4c-a96658ff4abe"
OLD = "a3208ad4-3427-4acf-9946-4ac4298b6bcb"
EVENT = "llaff707c0c9064758bda6e85905917737"
ACTION = "96e786d7-74f1-4f4c-82be-c4f9b5e95377"
RUN = "ee06a0a5-208d-422f-a147-c1417471cca5"
CALENDAR_HASH = "45f237882d5ad10dd8349206d05e16d7fa54f37ceeb97b89da6ef48c2eab55d1"
INPUT_HASH = "850e803ffdde52e0a48ac9d40481cc8c5faedb34f742771b956c466cf599d176"
SCOPE = "https://www.googleapis.com/auth/calendar.events.owned"


class Incomplete(Exception):
    """Never contains backend/provider errors, identifiers or token material."""


def need(condition):
    if not condition:
        raise Incomplete("calendar_qualification_incomplete")


class Backend:
    def __init__(self, database, settings, org, calendar):
        # Product's legacy imports load dotenv. Suppress that side effect in this
        # dedicated single-thread operator process; settings are explicitly supplied.
        from unittest.mock import patch
        with patch("dotenv.load_dotenv", return_value=False):
            from backend.app import calendar_runtime as runtime
        self.runtime = runtime
        self.database, self.settings, self.org, self.calendar = database, settings, org, calendar
        need(settings.environment == "staging")
        need(1 <= settings.connector_http_timeout_seconds <= 10)
        self.provider = runtime.GoogleCalendarHTTP(settings)

    def load(self):
        r = self.runtime
        with self.database.session_factory() as session:
            old = session.get(r.IntegrationConnection, OLD)
            new = session.get(r.IntegrationConnection, NEW)
            old_credential = session.get(r.CalendarCredential, OLD)
            credential = session.get(r.CalendarCredential, NEW)
            for conn, cred in ((old, old_credential), (new, credential)):
                need(conn is not None and cred is not None)
                need(conn.organization_id == self.org == cred.organization_id and conn.provider == "google_calendar")
                need(json.loads(cred.calendar_ids_json) == [self.calendar] and json.loads(cred.scopes_json) == [SCOPE])
            need(old.status == "revoked" and old_credential.revoked_at is not None and old_credential.revision == 2 and not old_credential.encrypted_json and old_credential.revoke_pending is False)
            need(new.status == "active" and credential.revoked_at is None and credential.encrypted_json and credential.revoke_pending is False)
            need(json.loads(new.settings_json).get("calendar_ids") == [self.calendar])
            action = session.get(r.AgentAction, ACTION)
            run = session.get(r.AgentRun, RUN)
            need(action is not None and run is not None and run.organization_id == self.org and action.run_id == RUN)
            need(action.status == "succeeded" and action.attempts == 1 and action.approval_status == "approved" and action.input_sha256 == action.approved_input_sha256 == INPUT_HASH)
            need(r.digest(action.input_json) == INPUT_HASH)
            expected = json.loads(action.dispatch_intent_json)
            need(expected["id"] == EVENT == "ll" + action.output_id.replace("-", ""))
            need(expected["visibility"] == "private" and expected["status"] == "confirmed" and expected["reminders"] == {"useDefault": False})
            provenance = expected["extendedProperties"]["private"]
            need(provenance["lenslayer_organization"] == self.org and provenance["lenslayer_connection"] == OLD and provenance["lenslayer_calendar"] == CALENDAR_HASH and provenance["lenslayer_run"] == RUN and provenance["lenslayer_action"] == ACTION and provenance["lenslayer_input"] == INPUT_HASH)
            # Detached snapshot: no open transaction during token/provider HTTP.
            session.expunge(credential)
            return credential, expected

    def expiry(self, credential):
        tokens = self.runtime.decrypt_credentials(self.settings, credential)
        try:
            expiry = datetime.fromisoformat(tokens["expires_at"])
            need(expiry.tzinfo is not None)
            return expiry.timestamp()
        finally:
            tokens.clear()

    def usable(self, credential):
        # Deliberately no force_refresh, expiry edits or independent token exchange.
        return self.runtime._usable_tokens(self.database, self.settings, self.provider, credential)

    def get_verify(self, access, expected):
        actual = self.provider.get_event(self.calendar, EVENT, access)
        self.provider.verify(actual, expected)

    def close(self):
        self.provider.close()


def qualify_existing(database, settings, organization_id, calendar_id, *, ack,
                     wait_seconds=0, _driver=None, _clock=time.time, _sleep=time.sleep):
    """Call ONLY inside an authorized, pinned-secret staging process.

    Optional wait is bounded to five minutes; if not due, a successful GET proves
    renewed-grant access only, NOT refresh. All failures stop without token retry.
    `_driver`/clock/sleep are offline-test seams, not a live alternative adapter.
    """
    driver, tokens = None, None
    try:
        need(ack == "existing-staging-grant-get-only-runtime-cas")
        need(type(wait_seconds) is int and 0 <= wait_seconds <= 300)
        need(hashlib.sha256(calendar_id.encode()).hexdigest() == CALENDAR_HASH)
        driver = _driver or Backend(database, settings, organization_id, calendar_id)
        credential, expected = driver.load()
        revision = credential.revision
        expiry = driver.expiry(credential)
        pause = min(wait_seconds, max(0, expiry - _clock() - 29))
        if pause:
            _sleep(pause)
        natural_due = expiry <= _clock() + 30
        tokens = driver.usable(credential)
        driver.get_verify(tokens["access_token"], expected)
        current, current_expected = driver.load()
        need(current.revision == credential.revision and current.encrypted_json == credential.encrypted_json and current_expected == expected)
        refreshed = credential.revision > revision
        need(not refreshed or (natural_due and credential.revision == revision + 1))
        return {"complete": True, "renewed_grant_event_get_verified": True,
                "connection_id": NEW, "event_id": EVENT,
                "credential_revision_before": revision, "credential_revision_after": current.revision,
                "natural_refresh_persisted_by_runtime_cas": refreshed,
                "provider_event_writes": False, "independent_api_inspector_qualified": False,
                "calendar_ownership_verified": False, "provider_account_subject_equality_proved": False,
                "production_session_binding_verified": False,
                "observed_at": datetime.fromtimestamp(_clock(), timezone.utc).isoformat()}
    except Exception:
        raise Incomplete("calendar_qualification_incomplete_no_retry") from None
    finally:
        if tokens is not None:
            tokens.clear()
        if driver is not None:
            try:
                driver.close()
            except Exception:
                raise Incomplete("calendar_qualification_incomplete_no_retry") from None
