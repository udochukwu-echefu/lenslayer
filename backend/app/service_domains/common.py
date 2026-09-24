from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import json
import re

from fastapi import HTTPException

from ..models import OrganizationInvitation, utcnow


def json_dump(value: Any) -> str:
    return json.dumps(value if value is not None else {}, ensure_ascii=False, default=str)


def json_load(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def safe_filename(value: str) -> str:
    name = Path(value or "contract").name
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-.")
    return cleaned or "contract"


VALID_ROLES = {"owner", "admin", "reviewer", "viewer"}


INVITABLE_ROLES = {"admin", "reviewer", "viewer"}


TASK_STATUSES = {"open", "in_progress", "done", "cancelled"}


TASK_SOURCE_KINDS = {"manual", "finding", "obligation", "deadline", "payment", "negotiation"}


CONTRACT_DECISIONS = {"accept", "change", "escalate", "resolve"}


INTEGRATION_PROVIDERS = {
    "email",
    "google_drive",
    "onedrive",
    "sharepoint",
    "dropbox",
    "slack",
    "telegram",
    "whatsapp",
    "public_api",
}


INTEGRATION_PROVIDER_CATALOG = {
    "email": ("Contract forwarding email", "email", ["document_intake"], "managed"),
    "google_drive": ("Google Drive", "cloud_storage", ["document_import", "folder_watch"], "oauth"),
    "onedrive": ("OneDrive", "cloud_storage", ["document_import", "folder_watch"], "oauth"),
    "sharepoint": ("SharePoint", "cloud_storage", ["document_import", "site_library_watch"], "oauth"),
    "dropbox": ("Dropbox", "cloud_storage", ["document_import", "folder_watch"], "oauth"),
    "slack": ("Slack", "messaging", ["document_intake", "review_notifications"], "oauth"),
    "telegram": ("Telegram", "messaging", ["document_intake", "review_notifications"], "bot"),
    "whatsapp": ("WhatsApp secure links", "messaging", ["secure_links", "review_notifications"], "secure_link"),
    "public_api": ("Public API", "developer", ["document_intake", "status_read", "webhooks"], "api_key"),
}


WEBHOOK_EVENTS = {"contract.created", "contract.review_ready", "contract.review_failed"}


API_KEY_SCOPES = {"contracts:write", "contracts:read", "webhooks:read"}


EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalized_role(role: str) -> str:
    return "reviewer" if role == "member" else role


def normalized_email(email: str) -> str:
    value = email.strip().casefold()
    if not EMAIL_PATTERN.fullmatch(value):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    return value


def aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def invitation_status(invitation: OrganizationInvitation) -> str:
    if invitation.accepted_at is not None:
        return "accepted"
    if invitation.revoked_at is not None:
        return "revoked"
    if aware(invitation.expires_at) <= utcnow():
        return "expired"
    return "pending"


def email_hint(email: str) -> str:
    local, _, domain = email.partition("@")
    visible = local[:1]
    return f"{visible}{'*' * max(len(local) - 1, 2)}@{domain}"
