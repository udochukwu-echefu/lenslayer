"""Read-only live acceptance inspector, never creates/updates/deletes events.

Uses a separately consented coordinator token, not the product's grant. Product
scope stays calendar.events.owned; inspector needs calendar.calendarlist.readonly
and calendar.events.readonly. A suffix alone is NOT proof of ownership.
"""
import hmac
from urllib.parse import parse_qs, quote, urlparse

from .calendar_connector import ConnectorError, GoogleCalendarHTTP


def callback_payload(callback_url, redirect_uri, expected_state):
    try:
        returned, expected = urlparse(callback_url), urlparse(redirect_uri)
        if ((returned.scheme, returned.netloc, returned.path) != (expected.scheme, expected.netloc, expected.path)
                or returned.fragment or returned.username or returned.password or len(callback_url) > 16384):
            raise ValueError()
        query = parse_qs(returned.query, keep_blank_values=True, strict_parsing=True)
        if "error" in query or any(len(query.get(k, [])) != 1 for k in ("code", "state")):
            raise ValueError()
        code, state = query["code"][0], query["state"][0]
        if not code or len(code) > 4096 or not state or not hmac.compare_digest(state, expected_state):
            raise ValueError()
        return {"code": code, "state": state}
    except (ValueError, TypeError):
        raise ValueError("Sandbox callback redirect/state rejected; no token exchange performed.") from None


class CalendarAcceptanceInspector:
    def __init__(self, settings, token, *, transport=None):
        if not isinstance(token, str) or not token or any(c.isspace() for c in token):
            raise ValueError("Independent read-only Calendar inspection token is required.")
        self.provider = GoogleCalendarHTTP(settings, transport=transport)
        self.token = token

    def close(self):
        self.provider.close()
        self.token = ""

    def _get(self, url, **kwargs):
        try:
            response = self.provider._request("GET", url, headers={"Authorization": "Bearer " + self.token}, **kwargs)
            if response.status_code != 200:
                raise ValueError()
            data = response.json()
            if not isinstance(data, dict):
                raise ValueError()
            return data
        except (ConnectorError, ValueError, TypeError):
            raise ValueError("Independent Calendar inspection failed; live acceptance is incomplete.") from None
        except Exception:
            # HTTP error text must not expose tokens or Google payloads.
            raise ValueError("Independent Calendar inspection failed; live acceptance is incomplete.") from None

    def owned_secondary(self, calendar_id):
        data = self._get("https://www.googleapis.com/calendar/v3/users/me/calendarList/" + quote(calendar_id, safe=""))
        if (data.get("id") != calendar_id or data.get("accessRole") != "owner"
                or type(data.get("primary", False)) is not bool or data.get("primary", False)
                or type(data.get("deleted", False)) is not bool or data.get("deleted", False)
                or not calendar_id.endswith("@group.calendar.google.com")):
            raise ValueError("Inspector must prove an owned SECONDARY disposable calendar, never primary/shared.")

    def exact_count(self, calendar_id, count, event_id=None):
        data = self._get("https://www.googleapis.com/calendar/v3/calendars/" + quote(calendar_id, safe="") + "/events",
                         params={"maxResults": 2, "showDeleted": "false", "singleEvents": "false"})
        items = data.get("items")
        if (not isinstance(items, list) or len(items) != count or data.get("nextPageToken")
                or (event_id is not None and (count != 1 or not isinstance(items[0], dict) or items[0].get("id") != event_id))):
            raise ValueError("Disposable Calendar must contain exactly the expected number of events; no automatic cleanup.")

    def verify_event(self, calendar_id, expected):
        actual = self.provider.get_event(calendar_id, expected["id"], self.token)
        try:
            GoogleCalendarHTTP.verify(actual, expected)
        except ConnectorError:
            raise ValueError("Independent GET did not verify the exact private event/provenance.") from None
        self.exact_count(calendar_id, 1, expected["id"])
