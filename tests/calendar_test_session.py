"""Explicit synthetic BFF proofs for local TestClient only, not browser evidence."""
import time
import uuid

import jwt

from backend.app.calendar_session import AUDIENCE, ISSUER, session_fingerprint
from backend.app.service_domains.agents import canonical_json, digest

TEST_SESSION_KEY = "synthetic-calendar-bff-HMAC-key-never-deploy-" * 2


def proof(settings, subject, organization_id, operation, payload, *, session_id="synthetic-browser-session-1", **overrides):
    now = int(time.time())
    return jwt.encode({"aud": AUDIENCE, "iss": ISSUER, "sub": subject, "org": organization_id, "op": operation,
        "fp": session_fingerprint(settings.calendar_session_binding_key, session_id), "body_sha256": digest(canonical_json(payload)),
        "jti": uuid.uuid4().hex, "iat": now, "nbf": now, "exp": now + 60, **overrides}, settings.calendar_session_binding_key, algorithm="HS256")


def attach_test_session(client, settings):
    original = client.request
    def request(method, url, **kwargs):
        path = str(url).split("?")[0].split("/")
        if method.upper() == "POST" and "calendar" in path and "organizations" in path:
            org = path[path.index("organizations") + 1]
            tail = path[path.index("calendar") + 1:]
            headers = dict(kwargs.get("headers") or {})
            subject = headers.get("X-LensLayer-User", "local-user")
            operation = "/".join(tail) if tail[:1] == ["oauth"] else "connections/disconnect"
            payload = kwargs.get("json") or ({"connection_id": tail[1]} if tail[:1] == ["connections"] else {})
            headers["X-LensLayer-Calendar-Session"] = proof(settings, subject, org, operation, payload)
            kwargs["headers"] = headers
        return original(method, url, **kwargs)
    return request
