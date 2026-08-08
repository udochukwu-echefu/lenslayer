from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from .config import Settings


@dataclass(frozen=True)
class Principal:
    subject: str
    email: str
    display_name: str


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
        from jwt import PyJWKClient
    except ImportError as exc:
        raise RuntimeError("Install PyJWT[crypto] to use OIDC authentication.") from exc

    token = _bearer_token(request)
    try:
        key = PyJWKClient(settings.oidc_jwks_url).get_signing_key_from_jwt(token).key
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
    email = str(claims.get("email") or "")
    display_name = str(claims.get("name") or email or "User")
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
