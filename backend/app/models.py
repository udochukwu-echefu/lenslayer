from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def new_id() -> str:
    return str(uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "platform_users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    external_subject: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(320), default="")
    display_name: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    memberships: Mapped[list["Membership"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    created_invitations: Mapped[list["OrganizationInvitation"]] = relationship(
        back_populates="created_by_user",
        foreign_keys="OrganizationInvitation.created_by_user_id",
    )


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    memberships: Mapped[list["Membership"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    contracts: Mapped[list["Contract"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    invitations: Mapped[list["OrganizationInvitation"]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    verification_cases: Mapped[list["VerificationCase"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    settings: Mapped["OrganizationSettings | None"] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
        uselist=False,
    )
    notifications: Mapped[list["Notification"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    integration_connections: Mapped[list["IntegrationConnection"]] = relationship(
        back_populates="organization",
        cascade="all, delete-orphan",
    )


class OrganizationSettings(Base):
    __tablename__ = "organization_settings"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    default_retention_days: Mapped[int] = mapped_column(Integer, default=30)
    default_retain_document: Mapped[bool] = mapped_column(Boolean, default=False)
    default_retain_source_text: Mapped[bool] = mapped_column(Boolean, default=False)
    notification_review_ready: Mapped[bool] = mapped_column(Boolean, default=True)
    notification_review_failed: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization: Mapped[Organization] = relationship(back_populates="settings")


class Membership(Base):
    __tablename__ = "organization_memberships"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_membership_org_user"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(32), default="member")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    organization: Mapped[Organization] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(back_populates="memberships")


class OrganizationInvitation(Base):
    __tablename__ = "organization_invitations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    role: Mapped[str] = mapped_column(String(32), default="reviewer")
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    organization: Mapped[Organization] = relationship(back_populates="invitations")
    created_by_user: Mapped[User] = relationship(back_populates="created_invitations", foreign_keys=[created_by_user_id])


class Contract(Base):
    __tablename__ = "platform_contracts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    title: Mapped[str] = mapped_column(String(512))
    source_name: Mapped[str] = mapped_column(String(512))
    counterparty: Mapped[str] = mapped_column(String(255), default="")
    contract_type: Mapped[str] = mapped_column(String(255), default="Unknown")
    status: Mapped[str] = mapped_column(String(32), default="processing", index=True)
    review_context_json: Mapped[str] = mapped_column(Text, default="{}")
    retain_document: Mapped[bool] = mapped_column(Boolean, default=False)
    retain_source_text: Mapped[bool] = mapped_column(Boolean, default=False)
    retention_days: Mapped[int] = mapped_column(Integer, default=30)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization: Mapped[Organization] = relationship(back_populates="contracts")
    assets: Mapped[list["DocumentAsset"]] = relationship(back_populates="contract", cascade="all, delete-orphan")
    jobs: Mapped[list["ProcessingJob"]] = relationship(back_populates="contract", cascade="all, delete-orphan")
    review: Mapped["ContractReview | None"] = relationship(back_populates="contract", cascade="all, delete-orphan")
    versions: Mapped[list["ContractVersion"]] = relationship(
        back_populates="contract",
        cascade="all, delete-orphan",
        order_by="ContractVersion.version_number",
    )


class WorkflowTask(Base):
    __tablename__ = "workflow_tasks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[str | None] = mapped_column(
        ForeignKey("platform_contracts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    assigned_to_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("platform_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(512))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(64), default="follow_up", index=True)
    priority: Mapped[str] = mapped_column(String(32), default="normal", index=True)
    status: Mapped[str] = mapped_column(String(32), default="open", index=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    source_kind: Mapped[str] = mapped_column(String(64), default="manual")
    source_reference_json: Mapped[str] = mapped_column(Text, default="{}")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    contract: Mapped[Contract | None] = relationship(foreign_keys=[contract_id])
    assigned_to_user: Mapped[User | None] = relationship(foreign_keys=[assigned_to_user_id])
    created_by_user: Mapped[User] = relationship(foreign_keys=[created_by_user_id])


class VerificationCase(Base):
    __tablename__ = "verification_cases"
    __table_args__ = (
        UniqueConstraint("organization_id", "reference", name="uq_verification_case_org_reference"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    seeded_by_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    reference: Mapped[str] = mapped_column(String(128), index=True)
    applicant_name: Mapped[str] = mapped_column(String(255), index=True)
    applicant_email: Mapped[str] = mapped_column(String(320), default="", index=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    priority: Mapped[str] = mapped_column(String(32), default="normal", index=True)
    assigned_to_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("platform_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    intake_channel: Mapped[str] = mapped_column(String(64), default="dashboard", index=True)
    risk_score: Mapped[int] = mapped_column(Integer, default=0, index=True)
    suggested_action: Mapped[str] = mapped_column(String(32), default="Escalate", index=True)
    finding_count: Mapped[int] = mapped_column(Integer, default=0)
    document_count: Mapped[int] = mapped_column(Integer, default=0)
    average_confidence: Mapped[int] = mapped_column(Integer, default=0)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    source_json: Mapped[str] = mapped_column(Text, default="{}")
    evaluation_json: Mapped[str] = mapped_column(Text, default="{}")
    synthetic: Mapped[bool] = mapped_column(Boolean, default=True)
    retention_days: Mapped[int] = mapped_column(Integer, default=30)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization: Mapped[Organization] = relationship(back_populates="verification_cases")
    seeded_by_user: Mapped[User] = relationship(foreign_keys=[seeded_by_user_id])
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_user_id])
    decisions: Mapped[list["VerificationDecision"]] = relationship(
        back_populates="verification_case",
        cascade="all, delete-orphan",
        order_by="VerificationDecision.created_at",
    )
    documents: Mapped[list["VerificationDocument"]] = relationship(
        back_populates="verification_case",
        cascade="all, delete-orphan",
        order_by="VerificationDocument.created_at",
    )
    assignments: Mapped[list["VerificationAssignment"]] = relationship(
        back_populates="verification_case",
        cascade="all, delete-orphan",
        order_by="VerificationAssignment.created_at",
    )
    reconciliations: Mapped[list["VerificationReconciliation"]] = relationship(
        back_populates="verification_case",
        cascade="all, delete-orphan",
        order_by="VerificationReconciliation.created_at",
    )


class VerificationDecision(Base):
    __tablename__ = "verification_decisions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    verification_case_id: Mapped[str] = mapped_column(
        ForeignKey("verification_cases.id", ondelete="CASCADE"),
        index=True,
    )
    reviewer_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    decision: Mapped[str] = mapped_column(String(32), index=True)
    rationale: Mapped[str] = mapped_column(Text)
    recommended_action: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    verification_case: Mapped[VerificationCase] = relationship(back_populates="decisions")
    reviewer: Mapped[User] = relationship(foreign_keys=[reviewer_user_id])


class VerificationDocument(Base):
    __tablename__ = "verification_documents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    verification_case_id: Mapped[str] = mapped_column(
        ForeignKey("verification_cases.id", ondelete="CASCADE"),
        index=True,
    )
    uploaded_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("platform_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    document_type: Mapped[str] = mapped_column(String(64), default="supporting_document", index=True)
    original_name: Mapped[str] = mapped_column(String(512))
    storage_key: Mapped[str] = mapped_column(String(1024), unique=True)
    content_type: Mapped[str] = mapped_column(String(255), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32), default="received", index=True)
    scan_status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    extraction_status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    extracted_fields_json: Mapped[str] = mapped_column(Text, default="{}")
    confidence: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    verification_case: Mapped[VerificationCase] = relationship(back_populates="documents")
    uploaded_by: Mapped[User | None] = relationship(foreign_keys=[uploaded_by_user_id])


class VerificationAssignment(Base):
    __tablename__ = "verification_assignments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    verification_case_id: Mapped[str] = mapped_column(
        ForeignKey("verification_cases.id", ondelete="CASCADE"),
        index=True,
    )
    assigned_to_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("platform_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    assigned_by_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    verification_case: Mapped[VerificationCase] = relationship(back_populates="assignments")
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_user_id])
    assigned_by: Mapped[User] = relationship(foreign_keys=[assigned_by_user_id])


class VerificationReconciliation(Base):
    __tablename__ = "verification_reconciliations"
    __table_args__ = (
        UniqueConstraint("verification_case_id", "field_name", name="uq_verification_reconciliation_field"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    verification_case_id: Mapped[str] = mapped_column(
        ForeignKey("verification_cases.id", ondelete="CASCADE"),
        index=True,
    )
    field_name: Mapped[str] = mapped_column(String(128), index=True)
    canonical_value: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="needs_review", index=True)
    sources_json: Mapped[str] = mapped_column(Text, default="[]")
    resolution_note: Mapped[str] = mapped_column(Text, default="")
    resolved_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("platform_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    verification_case: Mapped[VerificationCase] = relationship(back_populates="reconciliations")
    resolved_by: Mapped[User | None] = relationship(foreign_keys=[resolved_by_user_id])


class SecureIntakeLink(Base):
    __tablename__ = "secure_intake_links"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    verification_case_id: Mapped[str | None] = mapped_column(
        ForeignKey("verification_cases.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    token_prefix: Mapped[str] = mapped_column(String(16), index=True)
    channel: Mapped[str] = mapped_column(String(32), default="secure_link", index=True)
    recipient_name: Mapped[str] = mapped_column(String(255), default="")
    recipient_email: Mapped[str] = mapped_column(String(320), default="")
    recipient_phone_hint: Mapped[str] = mapped_column(String(64), default="")
    applicant_name: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text, default="")
    max_uploads: Mapped[int] = mapped_column(Integer, default=5)
    upload_count: Mapped[int] = mapped_column(Integer, default=0)
    retention_days: Mapped[int] = mapped_column(Integer, default=30)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    created_by: Mapped[User] = relationship(foreign_keys=[created_by_user_id])
    verification_case: Mapped[VerificationCase | None] = relationship(foreign_keys=[verification_case_id])


class DocumentAsset(Base):
    __tablename__ = "document_assets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey("platform_contracts.id", ondelete="CASCADE"), index=True)
    storage_key: Mapped[str] = mapped_column(String(1024), unique=True)
    original_name: Mapped[str] = mapped_column(String(512))
    content_type: Mapped[str] = mapped_column(String(255), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32), default="available")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    contract: Mapped[Contract] = relationship(back_populates="assets")


class ContractVersion(Base):
    __tablename__ = "contract_versions"
    __table_args__ = (
        UniqueConstraint("contract_id", "version_number", name="uq_contract_version_number"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey("platform_contracts.id", ondelete="CASCADE"), index=True)
    document_asset_id: Mapped[str | None] = mapped_column(
        ForeignKey("document_assets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    uploaded_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("platform_users.id"), nullable=True, index=True)
    version_number: Mapped[int] = mapped_column(Integer, index=True)
    label: Mapped[str] = mapped_column(String(255), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    source_name: Mapped[str] = mapped_column(String(512))
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    comparison_json: Mapped[str] = mapped_column(Text, default="{}")
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    contract: Mapped[Contract] = relationship(back_populates="versions")
    document_asset: Mapped[DocumentAsset | None] = relationship(foreign_keys=[document_asset_id])
    uploaded_by: Mapped[User | None] = relationship(foreign_keys=[uploaded_by_user_id])


class NegotiationItem(Base):
    __tablename__ = "negotiation_items"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey("platform_contracts.id", ondelete="CASCADE"), index=True)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    title: Mapped[str] = mapped_column(String(512))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(64), default="change", index=True)
    priority: Mapped[str] = mapped_column(String(32), default="normal", index=True)
    status: Mapped[str] = mapped_column(String(32), default="proposed", index=True)
    our_position: Mapped[str] = mapped_column(Text, default="")
    counterparty_position: Mapped[str] = mapped_column(Text, default="")
    source_reference_json: Mapped[str] = mapped_column(Text, default="{}")
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    created_by: Mapped[User] = relationship(foreign_keys=[created_by_user_id])


class CounterpartyResponse(Base):
    __tablename__ = "counterparty_responses"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey("platform_contracts.id", ondelete="CASCADE"), index=True)
    contract_version_id: Mapped[str | None] = mapped_column(
        ForeignKey("contract_versions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    recorded_by_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    responder_name: Mapped[str] = mapped_column(String(255), default="")
    channel: Mapped[str] = mapped_column(String(64), default="email", index=True)
    body: Mapped[str] = mapped_column(Text)
    related_item_ids_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    contract_version: Mapped[ContractVersion | None] = relationship(foreign_keys=[contract_version_id])
    recorded_by: Mapped[User] = relationship(foreign_keys=[recorded_by_user_id])


class IntegrationConnection(Base):
    __tablename__ = "integration_connections"
    __table_args__ = (
        UniqueConstraint("organization_id", "provider", "external_account_id", name="uq_integration_org_provider_account"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    provider: Mapped[str] = mapped_column(String(64), index=True)
    display_name: Mapped[str] = mapped_column(String(255))
    external_account_id: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    capabilities_json: Mapped[str] = mapped_column(Text, default="[]")
    settings_json: Mapped[str] = mapped_column(Text, default="{}")
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    organization: Mapped[Organization] = relationship(back_populates="integration_connections")
    created_by: Mapped[User] = relationship(foreign_keys=[created_by_user_id])


class IntegrationImport(Base):
    __tablename__ = "integration_imports"
    __table_args__ = (
        UniqueConstraint("organization_id", "provider", "external_id", name="uq_integration_import_source"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    connection_id: Mapped[str | None] = mapped_column(
        ForeignKey("integration_connections.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    contract_id: Mapped[str | None] = mapped_column(
        ForeignKey("platform_contracts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    imported_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("platform_users.id"), nullable=True, index=True)
    provider: Mapped[str] = mapped_column(String(64), index=True)
    source_type: Mapped[str] = mapped_column(String(64), index=True)
    external_id: Mapped[str] = mapped_column(String(512), default="")
    source_url: Mapped[str] = mapped_column(String(1024), default="")
    title: Mapped[str] = mapped_column(String(512))
    original_name: Mapped[str] = mapped_column(String(512))
    content_type: Mapped[str] = mapped_column(String(255), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32), default="imported", index=True)
    metadata_json: Mapped[str] = mapped_column(Text, default="{}")
    error_message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    connection: Mapped[IntegrationConnection | None] = relationship(foreign_keys=[connection_id])
    contract: Mapped[Contract | None] = relationship(foreign_keys=[contract_id])
    imported_by: Mapped[User | None] = relationship(foreign_keys=[imported_by_user_id])


class PublicApiKey(Base):
    __tablename__ = "public_api_keys"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    key_prefix: Mapped[str] = mapped_column(String(32), index=True)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    scopes_json: Mapped[str] = mapped_column(Text, default="[]")
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    created_by: Mapped[User] = relationship(foreign_keys=[created_by_user_id])


class WebhookSubscription(Base):
    __tablename__ = "webhook_subscriptions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    target_url: Mapped[str] = mapped_column(String(1024))
    description: Mapped[str] = mapped_column(String(255), default="")
    events_json: Mapped[str] = mapped_column(Text, default="[]")
    signing_secret_hash: Mapped[str] = mapped_column(String(64), index=True)
    secret_prefix: Mapped[str] = mapped_column(String(16), default="")
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    last_delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    created_by: Mapped[User] = relationship(foreign_keys=[created_by_user_id])


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    subscription_id: Mapped[str] = mapped_column(ForeignKey("webhook_subscriptions.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[str | None] = mapped_column(
        ForeignKey("platform_contracts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(128), index=True)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str] = mapped_column(Text, default="")
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    subscription: Mapped[WebhookSubscription] = relationship(foreign_keys=[subscription_id])


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey("platform_contracts.id", ondelete="CASCADE"), index=True)
    document_asset_id: Mapped[str] = mapped_column(ForeignKey("document_assets.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32), default="contract_review")
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    progress_step: Mapped[str] = mapped_column(String(255), default="Queued")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str] = mapped_column(String(128), default="")
    error_message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    contract: Mapped[Contract] = relationship(back_populates="jobs")


class ContractReview(Base):
    __tablename__ = "contract_reviews"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey("platform_contracts.id", ondelete="CASCADE"), unique=True, index=True)
    analysis_json: Mapped[str] = mapped_column(Text, default="{}")
    quality_json: Mapped[str] = mapped_column(Text, default="{}")
    source_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    contract: Mapped[Contract] = relationship(back_populates="review")


class PlatformAuditEvent(Base):
    __tablename__ = "platform_audit_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("platform_users.id"), nullable=True, index=True)
    contract_id: Mapped[str | None] = mapped_column(ForeignKey("platform_contracts.id", ondelete="SET NULL"), nullable=True, index=True)
    verification_case_id: Mapped[str | None] = mapped_column(
        ForeignKey("verification_cases.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(128), index=True)
    detail_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[str | None] = mapped_column(
        ForeignKey("platform_contracts.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text)
    action_url: Mapped[str] = mapped_column(String(1024), default="")
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    organization: Mapped[Organization] = relationship(back_populates="notifications")
    user: Mapped[User] = relationship(foreign_keys=[user_id])
    contract: Mapped[Contract | None] = relationship(foreign_keys=[contract_id])


class ContractComment(Base):
    __tablename__ = "contract_comments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey("platform_contracts.id", ondelete="CASCADE"), index=True)
    author_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    body: Mapped[str] = mapped_column(Text)
    mentions_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    author: Mapped[User] = relationship(foreign_keys=[author_user_id])


class ContractDecision(Base):
    __tablename__ = "contract_decisions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey("platform_contracts.id", ondelete="CASCADE"), index=True)
    reviewer_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    decision: Mapped[str] = mapped_column(String(32), index=True)
    subject: Mapped[str] = mapped_column(String(512), default="Contract review")
    rationale: Mapped[str] = mapped_column(Text)
    source_reference_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    reviewer: Mapped[User] = relationship(foreign_keys=[reviewer_user_id])


class ApprovalRequest(Base):
    __tablename__ = "approval_requests"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey("platform_contracts.id", ondelete="CASCADE"), index=True)
    requested_by_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    assigned_to_user_id: Mapped[str | None] = mapped_column(ForeignKey("platform_users.id"), nullable=True, index=True)
    resolved_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("platform_users.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(512))
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    conditions_json: Mapped[str] = mapped_column(Text, default="[]")
    condition_results_json: Mapped[str] = mapped_column(Text, default="{}")
    resolution_note: Mapped[str] = mapped_column(Text, default="")
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    requested_by: Mapped[User] = relationship(foreign_keys=[requested_by_user_id])
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_user_id])
    resolved_by: Mapped[User | None] = relationship(foreign_keys=[resolved_by_user_id])


class ExternalShare(Base):
    __tablename__ = "external_shares"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey("platform_contracts.id", ondelete="CASCADE"), index=True)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(255), default="External reviewer")
    include_evidence: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    created_by: Mapped[User] = relationship(foreign_keys=[created_by_user_id])


class LifecycleItem(Base):
    __tablename__ = "contract_lifecycle_items"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey("platform_contracts.id", ondelete="CASCADE"), index=True)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    owner_user_id: Mapped[str | None] = mapped_column(ForeignKey("platform_users.id"), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(512))
    description: Mapped[str] = mapped_column(Text, default="")
    amount: Mapped[str] = mapped_column(String(255), default="")
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    reminder_days: Mapped[int] = mapped_column(Integer, default=7)
    recurrence: Mapped[str] = mapped_column(String(32), default="none", index=True)
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    last_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    contract: Mapped[Contract] = relationship(foreign_keys=[contract_id])
    created_by: Mapped[User] = relationship(foreign_keys=[created_by_user_id])
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_user_id])
