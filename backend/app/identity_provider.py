"""Removes a deleted user's login identity from Auth0."""
from __future__ import annotations

import logging
from urllib.parse import quote

import httpx

from .config import Settings

logger = logging.getLogger(__name__)


def delete_identity(settings: Settings, subject: str) -> bool:
    """Return True only when Auth0 confirms the identity is gone."""
    domain = settings.auth0_management_domain.strip().removeprefix("https://").rstrip("/")
    if settings.auth_mode == "local" or not (
        domain and settings.auth0_management_client_id and settings.auth0_management_client_secret
    ):
        return False
    try:
        with httpx.Client(base_url=f"https://{domain}", timeout=10.0) as client:
            token = client.post("/oauth/token", json={
                "grant_type": "client_credentials",
                "client_id": settings.auth0_management_client_id,
                "client_secret": settings.auth0_management_client_secret,
                "audience": f"https://{domain}/api/v2/",
            })
            token.raise_for_status()
            response = client.delete(
                f"/api/v2/users/{quote(subject, safe='')}",
                headers={"Authorization": f"Bearer {token.json()['access_token']}"},
            )
            # 404 means the identity was already removed.
            if response.status_code in (204, 404):
                return True
            logger.warning("Auth0 identity deletion returned HTTP %s", response.status_code)
    except (httpx.HTTPError, KeyError, ValueError):
        logger.warning("Auth0 identity deletion failed")
    return False
