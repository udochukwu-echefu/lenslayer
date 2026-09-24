from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..config import Settings
from ..document_intelligence import ReviewWorkflow, build_review_workflow
from ..email_delivery import queue_email
from ..models import Notification, PlatformAuditEvent, User
from ..object_storage import ObjectStore
from .common import json_dump
from .interfaces import DomainDependencies


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
