from __future__ import annotations

import ssl
from dataclasses import dataclass
from functools import lru_cache

import certifi
from fastapi import HTTPException, Request, status

from .config import Settings


@dataclass(frozen=True)
class Principal:
    subject: str
    email: str
    display_name: str


@lru_cache(maxsize=8)
def _jwks_client(url: str):
    try:
        from jwt import PyJWKClient
    except ImportError as exc:
        raise RuntimeError("Install PyJWT[crypto] to use OIDC authentication.") from exc
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    return PyJWKClient(url, cache_keys=True, lifespan=3600, ssl_context=ssl_context)


def _bearer_token(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid bearer token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token.strip()


def _oidc_principal(request: Request, settings: Settings) -> Principal:
    try:
        import jwt
    except ImportError as exc:
        raise RuntimeError("Install PyJWT[crypto] to use OIDC authentication.") from exc

    token = _bearer_token(request)
    try:
        key = _jwks_client(settings.oidc_jwks_url).get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256", "ES256"],
            audience=settings.oidc_audience,
            issuer=settings.oidc_issuer,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The access token could not be verified.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    subject = str(claims.get("sub") or "").strip()
    if not subject:
        raise HTTPException(status_code=401, detail="The access token has no stable subject claim.")
    email = str(claims.get(settings.oidc_email_claim) or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="The access token has no email claim.")
    if settings.oidc_require_verified_email and claims.get(settings.oidc_email_verified_claim) is not True:
        raise HTTPException(status_code=403, detail="Verify your email address before using LensLayer.")
    display_name = str(claims.get(settings.oidc_name_claim) or email or "User")
    return Principal(subject=subject, email=email, display_name=display_name)


def resolve_principal(request: Request) -> Principal:
    settings: Settings = request.app.state.settings
    if settings.auth_mode.lower() == "oidc":
        return _oidc_principal(request, settings)

    subject = request.headers.get("x-lenslayer-user", "local-user").strip()
    if not subject:
        raise HTTPException(status_code=401, detail="A local development user is required.")
    email = request.headers.get("x-lenslayer-email", "")
    display_name = request.headers.get("x-lenslayer-name", email or "Local user")
    return Principal(subject=subject, email=email, display_name=display_name)
