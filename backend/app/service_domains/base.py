from __future__ import annotations

import hashlib
import csv
import calendar
import difflib
import io
import json
import math
import os
import re
import tempfile
import secrets
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import Settings
from ..document_intelligence import ReviewWorkflow, build_review_workflow
from ..models import (
    ApprovalRequest,
    Contract,
    ContractComment,
    ContractDecision,
    ContractReview,
    ContractVersion,
    CounterpartyResponse,
    DocumentAsset,
    ExternalShare,
    IntegrationConnection,
    IntegrationImport,
    LifecycleItem,
    Membership,
    NegotiationItem,
    Notification,
    Organization,
    OrganizationInvitation,
    OrganizationSettings,
    PlatformAuditEvent,
    ProcessingJob,
    PublicApiKey,
    User,
    WebhookDelivery,
    WebhookSubscription,
    WorkflowTask,
    utcnow,
)
from ..object_storage import ObjectStore
from ..malware import scan_upload
from ..email_delivery import queue_email
from ..schemas import (
    ApprovalRequestResponse,
    ApiKeyCreatedResponse,
    ApiKeyResponse,
    AuditEventResponse,
    ContractActivityResponse,
    ContractCommentResponse,
    ContractDecisionResponse,
    DealPassportResponse,
    ContractResponse,
    ContractVersionResponse,
    CounterpartyResponseResponse,
    ExternalShareResponse,
    IntegrationConnectionResponse,
    IntegrationImportResponse,
    IntegrationProviderResponse,
    IntakeAddressResponse,
    IntakeCreatedResponse,
    InvitationPreviewResponse,
    InvitationResponse,
    JobResponse,
    LifecycleItemResponse,
    MembershipResponse,
    NegotiationItemResponse,
    NegotiationSummaryResponse,
    NotificationResponse,
    OrganizationSettingsResponse,
    PortfolioQuestionResponse,
    PortfolioQuestionSource,
    ReportActivityItem,
    ReportDistributionItem,
    ReportOverviewResponse,
    ReportTimelinePoint,
    ReportWorkloadItem,
    ReviewResponse,
    TaskResponse,
    WebhookDeliveryResponse,
    WebhookSubscriptionResponse,
)
from ..security import Principal
from .interfaces import DomainDependencies


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
TASK_PRIORITIES = {"low", "normal", "high"}
TASK_CATEGORIES = {"follow_up", "risk", "obligation", "deadline", "negotiation", "professional_review"}
TASK_SOURCE_KINDS = {"manual", "finding", "obligation", "deadline", "payment", "negotiation"}
CONTRACT_DECISIONS = {"accept", "change", "escalate", "resolve"}
APPROVAL_STATUSES = {"pending", "approved", "conditionally_approved", "changes_requested", "rejected", "cancelled"}
LIFECYCLE_KINDS = {"renewal", "notice", "obligation", "payment", "post_signature"}
LIFECYCLE_STATUSES = {"active", "completed", "cancelled"}
RECURRENCES = {"none", "weekly", "monthly", "quarterly", "yearly"}
NEGOTIATION_STATUSES = {"proposed", "accepted", "rejected", "unresolved", "resolved"}
NEGOTIATION_CATEGORIES = {"change", "commercial", "legal", "operational", "open_point"}
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


class ServiceBase:
    def __init__(
        self,
        session: Session,
        settings: Settings,
        object_store: ObjectStore,
        review_workflow: ReviewWorkflow | None = None,
        domain_dependencies: DomainDependencies | None = None,
    ):
        self.session = session
        self.settings = settings
        self.object_store = object_store
        self.review_workflow = review_workflow or build_review_workflow()
        dependencies = domain_dependencies or DomainDependencies()
        self.workspace = dependencies.workspace or self
        self.contracts = dependencies.contracts or self
        self.tasks = dependencies.tasks or self
        self.collaboration = dependencies.collaboration or self
        self.integrations = dependencies.integrations or self

    def _notify(
        self,
        organization_id: str,
        user_id: str,
        contract_id: str | None,
        kind: str,
        title: str,
        message: str,
        action_url: str,
    ) -> None:
        notification = Notification(
            organization_id=organization_id,
            user_id=user_id,
            contract_id=contract_id,
            kind=kind,
            title=title,
            message=message,
            action_url=action_url,
        )
        self.session.add(notification)
        recipient = self.session.get(User, user_id)
        queue_email(
            self.session,
            self.settings,
            organization_id=organization_id,
            user_id=user_id,
            recipient=recipient.email if recipient else "",
            kind=kind,
            subject=title,
            message=message,
            action_url=action_url,
        )

    def _audit(
        self,
        organization_id: str,
        actor_user_id: str | None,
        action: str,
        contract_id: str | None = None,
        detail: dict[str, Any] | None = None,
    ) -> None:
        self.session.add(
            PlatformAuditEvent(
                organization_id=organization_id,
                actor_user_id=actor_user_id,
                contract_id=contract_id,
                action=action,
                detail_json=json_dump(detail or {}),
            )
        )
