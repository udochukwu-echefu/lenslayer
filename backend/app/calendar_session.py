"""Server BFF attestations only. No caller-asserted session IDs or raw proof logging."""
import hashlib
import hmac
import re
from datetime import datetime, timezone

import jwt
from fastapi import HTTPException
from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError

from .connector_models import CalendarSessionProof
from .models import utcnow
from .service_domains.agents import canonical_json, digest

AUDIENCE = "lenslayer-calendar-session"
ISSUER = "lenslayer-dashboard"


def session_fingerprint(key, session_id):
    return hmac.new(key.encode(), ("lenslayer-calendar-session-v1:" + session_id).encode(), hashlib.sha256).hexdigest()


def verify_session_proof(settings, session, user, organization_id, operation, payload, proof):
    if len(settings.calendar_session_binding_key) < 32:
        raise HTTPException(503, "Trusted Calendar session binding is not configured.")
    try:
        if not isinstance(proof, str) or not 1 <= len(proof) <= 4096:
            raise ValueError()
        claims = jwt.decode(proof, settings.calendar_session_binding_key, algorithms=["HS256"], audience=AUDIENCE, issuer=ISSUER,
            options={"require": ["sub", "org", "op", "fp", "body_sha256", "jti", "iat", "nbf", "exp"]})
        now = int(utcnow().timestamp())
        if (any(type(claims[k]) is not int for k in ("iat", "nbf", "exp"))
                or not now - 65 <= claims["iat"] <= now or claims["nbf"] != claims["iat"]
                or not 0 < claims["exp"] - claims["iat"] <= 60
                or claims["sub"] != user.external_subject or claims["org"] != organization_id or claims["op"] != operation
                or not isinstance(claims["fp"], str) or not re.fullmatch(r"[0-9a-f]{64}", claims["fp"])
                or not isinstance(claims["jti"], str) or not re.fullmatch(r"[A-Za-z0-9_-]{32,64}", claims["jti"])
                or claims["body_sha256"] != digest(canonical_json(payload))):
            raise ValueError()
    except (jwt.PyJWTError, ValueError, KeyError, TypeError):
        raise HTTPException(403, "Trusted Calendar session proof is invalid or expired.") from None
    # Single-use attestation independent of the single-use provider OAuth state.
    session.execute(delete(CalendarSessionProof).where(CalendarSessionProof.expires_at <= utcnow()))
    try:
        with session.begin_nested():
            session.add(CalendarSessionProof(nonce_sha256=digest(claims["jti"]), organization_id=organization_id,
                expires_at=datetime.fromtimestamp(claims["exp"], timezone.utc)))
            session.flush()
    except IntegrityError:
        raise HTTPException(409, "Trusted Calendar session proof has already been used.") from None
    return claims["fp"]
