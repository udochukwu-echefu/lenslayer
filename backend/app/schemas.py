from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    display_name: str


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=2, max_length=120)


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    role: str | None = None
    created_at: datetime


class OrganizationSettingsUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    default_retention_days: Literal[7, 30, 90, 365] | None = None
    default_retain_document: bool | None = None
    default_retain_source_text: bool | None = None
    notification_review_ready: bool | None = None
    notification_review_failed: bool | None = None


class OrganizationSettingsResponse(BaseModel):
    organization_id: str
    name: str
    slug: str
    default_retention_days: Literal[7, 30, 90, 365]
    default_retain_document: bool
    default_retain_source_text: bool
    notification_review_ready: bool
    notification_review_failed: bool
    updated_at: datetime


RoleName = Literal["owner", "admin", "reviewer", "viewer"]
InviteRoleName = Literal["admin", "reviewer", "viewer"]
TaskStatusName = Literal["open", "in_progress", "done", "cancelled"]
TaskPriorityName = Literal["low", "normal", "high"]
TaskCategoryName = Literal["follow_up", "risk", "obligation", "deadline", "negotiation", "professional_review"]
VerificationActionName = Literal["Approve", "Escalate", "Reject"]
VerificationStatusName = Literal[
    "pending",
    "in_review",
    "needs_information",
    "approved",
    "escalated",
    "rejected",
    "closed",
]
VerificationPriorityName = Literal["low", "normal", "high", "urgent"]
ReconciliationStatusName = Literal["matched", "conflict", "needs_review", "resolved"]
ReportRangeName = Literal["30d", "90d", "365d", "all"]
IntegrationProviderName = Literal[
    "email",
    "google_drive",
    "onedrive",
    "sharepoint",
    "dropbox",
    "slack",
    "telegram",
    "whatsapp",
    "public_api",
]
IntegrationStatusName = Literal["active", "paused", "revoked", "error"]
WebhookEventName = Literal["contract.created", "contract.review_ready", "contract.review_failed"]


class MembershipResponse(BaseModel):
    id: str
    user_id: str
    email: str
    display_name: str
    role: RoleName
    created_at: datetime


class MembershipRoleUpdate(BaseModel):
    role: RoleName


class InvitationCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    role: InviteRoleName = "reviewer"


class InvitationResponse(BaseModel):
    id: str
    email: str
    role: InviteRoleName
    status: Literal["pending", "accepted", "revoked", "expired"]
    expires_at: datetime
    accepted_at: datetime | None
    created_at: datetime


class InvitationCreatedResponse(BaseModel):
    invitation: InvitationResponse
    token: str


class InvitationPreviewResponse(BaseModel):
    organization_name: str
    organization_slug: str
    email_hint: str
    role: InviteRoleName
    status: Literal["pending", "accepted", "revoked", "expired"]
    expires_at: datetime


class InvitationAcceptResponse(BaseModel):
    organization: OrganizationResponse
    membership: MembershipResponse


class TaskCreate(BaseModel):
    title: str = Field(min_length=2, max_length=512)
    description: str = Field(default="", max_length=4000)
    contract_id: str | None = None
    assigned_to_user_id: str | None = None
    category: TaskCategoryName = "follow_up"
    priority: TaskPriorityName = "normal"
    status: TaskStatusName = "open"
    due_at: datetime | None = None
    source_kind: str = Field(default="manual", max_length=64)
    source_reference: dict[str, Any] = Field(default_factory=dict)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=512)
    description: str | None = Field(default=None, max_length=4000)
    contract_id: str | None = None
    assigned_to_user_id: str | None = None
    category: TaskCategoryName | None = None
    priority: TaskPriorityName | None = None
    status: TaskStatusName | None = None
    due_at: datetime | None = None


class TaskResponse(BaseModel):
    id: str
    organization_id: str
    contract_id: str | None
    contract_title: str | None
    created_by_user_id: str
    assigned_to_user_id: str | None
    assigned_to_name: str | None
    assigned_to_email: str | None
    title: str
    description: str
    category: TaskCategoryName
    priority: TaskPriorityName
    status: TaskStatusName
    due_at: datetime | None
    source_kind: str
    source_reference: dict[str, Any]
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class VerificationDecisionCreate(BaseModel):
    decision: VerificationActionName
    rationale: str = Field(min_length=10, max_length=4000)


class VerificationCaseUpdate(BaseModel):
    status: VerificationStatusName | None = None
    priority: VerificationPriorityName | None = None
    due_at: datetime | None = None


class VerificationAssignmentCreate(BaseModel):
    assigned_to_user_id: str | None = None
    note: str = Field(default="", max_length=2000)


class VerificationAssignmentResponse(BaseModel):
    id: str
    assigned_to_user_id: str | None
    assigned_to_name: str
    assigned_to_email: str
    assigned_by_user_id: str
    assigned_by_name: str
    note: str
    created_at: datetime


class VerificationReconciliationUpsert(BaseModel):
    field_name: str = Field(min_length=1, max_length=128)
    canonical_value: str = Field(default="", max_length=4000)
    status: ReconciliationStatusName = "needs_review"
    sources: list[dict[str, Any]] = Field(default_factory=list, max_length=50)
    resolution_note: str = Field(default="", max_length=4000)


class VerificationReconciliationResponse(BaseModel):
    id: str
    field_name: str
    canonical_value: str
    status: ReconciliationStatusName
    sources: list[dict[str, Any]]
    resolution_note: str
    resolved_by_user_id: str | None
    resolved_by_name: str
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime


class VerificationDocumentResponse(BaseModel):
    id: str
    document_type: str
    original_name: str
    content_type: str
    size_bytes: int
    sha256: str
    status: str
    scan_status: str
    extraction_status: str
    extracted_fields: dict[str, Any]
    confidence: int
    uploaded_by_user_id: str | None
    uploaded_by_name: str
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime


class VerificationDocumentReview(BaseModel):
    scan_status: Literal["pending", "clean", "rejected"]
    extraction_status: Literal["pending", "processing", "ready", "failed"]
    extracted_fields: dict[str, Any] = Field(default_factory=dict)
    confidence: int = Field(default=0, ge=0, le=100)


class VerificationDecisionResponse(BaseModel):
    id: str
    decision: VerificationActionName
    rationale: str
    recommended_action: VerificationActionName
    reviewer_user_id: str
    reviewer_name: str
    reviewer_email: str
    created_at: datetime


class VerificationCaseSummaryResponse(BaseModel):
    id: str
    organization_id: str
    reference: str
    applicant_name: str
    applicant_email: str
    status: VerificationStatusName
    priority: VerificationPriorityName
    assigned_to_user_id: str | None
    assigned_to_name: str
    assigned_to_email: str
    intake_channel: str
    risk_score: int
    suggested_action: VerificationActionName
    finding_count: int
    document_count: int
    average_confidence: int
    submitted_at: datetime
    synthetic: bool
    due_at: datetime | None
    expires_at: datetime | None
    closed_at: datetime | None
    latest_decision: VerificationDecisionResponse | None
    created_at: datetime
    updated_at: datetime


class VerificationCaseResponse(VerificationCaseSummaryResponse):
    application: dict[str, Any]
    documents: list[dict[str, Any]]
    summary: str
    reasoning: str
    findings: list[dict[str, Any]]
    field_matrix: list[dict[str, Any]]
    generated_at: str
    decision_history: list[VerificationDecisionResponse]
    uploaded_documents: list[VerificationDocumentResponse]
    assignment_history: list[VerificationAssignmentResponse]
    reconciliations: list[VerificationReconciliationResponse]


class SecureIntakeLinkCreate(BaseModel):
    channel: Literal["secure_link", "email", "slack", "telegram", "whatsapp"] = "secure_link"
    recipient_name: str = Field(default="", max_length=255)
    recipient_email: str = Field(default="", max_length=320)
    recipient_phone_hint: str = Field(default="", max_length=64)
    applicant_name: str = Field(min_length=2, max_length=255)
    message: str = Field(default="", max_length=2000)
    expires_in_days: Literal[1, 3, 7, 14, 30] = 7
    max_uploads: int = Field(default=5, ge=1, le=20)
    retention_days: Literal[7, 30, 90, 365] = 30


class SecureIntakeLinkResponse(BaseModel):
    id: str
    organization_id: str
    verification_case_id: str | None
    token_prefix: str
    channel: str
    recipient_name: str
    recipient_email: str
    recipient_phone_hint: str
    applicant_name: str
    message: str
    max_uploads: int
    upload_count: int
    retention_days: int
    status: Literal["active", "expired", "revoked", "complete"]
    expires_at: datetime
    revoked_at: datetime | None
    last_used_at: datetime | None
    created_by_user_id: str
    created_by_name: str
    created_at: datetime


class SecureIntakeLinkCreatedResponse(BaseModel):
    intake_link: SecureIntakeLinkResponse
    token: str


class SecureIntakePreviewResponse(BaseModel):
    organization_name: str
    applicant_name: str
    message: str
    remaining_uploads: int
    status: Literal["active", "expired", "revoked", "complete"]
    expires_at: datetime


class SecureIntakeUploadResponse(BaseModel):
    verification_case: VerificationCaseSummaryResponse
    documents: list[VerificationDocumentResponse]


class IntakeAddressResponse(BaseModel):
    address: str
    enabled: bool
    instructions: str


class IntegrationProviderResponse(BaseModel):
    provider: IntegrationProviderName
    display_name: str
    category: Literal["email", "cloud_storage", "messaging", "developer"]
    capabilities: list[str]
    connection_mode: Literal["managed", "oauth", "bot", "webhook", "api_key", "secure_link"]
    configured: bool


class AssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    original_name: str
    content_type: str
    size_bytes: int
    sha256: str
    status: str
    created_at: datetime


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    status: str
    progress_step: str
    attempts: int
    error_code: str
    error_message: str
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class ReviewResponse(BaseModel):
    id: str
    analysis: dict[str, Any]
    quality: dict[str, Any]
    source_text_retained: bool
    created_at: datetime
    updated_at: datetime


class ContractQuestionCreate(BaseModel):
    question: str = Field(min_length=3, max_length=2000)


class ContractQuestionSource(BaseModel):
    label: str
    location: str
    excerpt: str


class ContractQuestionResponse(BaseModel):
    answer: str
    sources: list[ContractQuestionSource]
    generated_by: Literal["model", "extractive"]


class NotificationResponse(BaseModel):
    id: str
    organization_id: str
    contract_id: str | None
    kind: str
    title: str
    message: str
    action_url: str
    read_at: datetime | None
    created_at: datetime


ContractDecisionName = Literal["accept", "change", "escalate", "resolve"]
ApprovalStatusName = Literal["pending", "approved", "conditionally_approved", "changes_requested", "rejected", "cancelled"]
LifecycleKindName = Literal["renewal", "notice", "obligation", "payment", "post_signature"]
LifecycleStatusName = Literal["active", "completed", "cancelled"]
RecurrenceName = Literal["none", "weekly", "monthly", "quarterly", "yearly"]
NegotiationItemStatusName = Literal["proposed", "accepted", "rejected", "unresolved", "resolved"]
NegotiationItemCategoryName = Literal["change", "commercial", "legal", "operational", "open_point"]


class ContractCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=8000)
    mentioned_user_ids: list[str] = Field(default_factory=list, max_length=25)


class ContractCommentResponse(BaseModel):
    id: str
    body: str
    mentioned_user_ids: list[str]
    author_user_id: str
    author_name: str
    author_email: str
    created_at: datetime
    updated_at: datetime


class ContractDecisionCreate(BaseModel):
    decision: ContractDecisionName
    subject: str = Field(default="Contract review", min_length=2, max_length=512)
    rationale: str = Field(min_length=5, max_length=8000)
    source_reference: dict[str, Any] = Field(default_factory=dict)


class ContractDecisionResponse(BaseModel):
    id: str
    decision: ContractDecisionName
    subject: str
    rationale: str
    source_reference: dict[str, Any]
    reviewer_user_id: str
    reviewer_name: str
    reviewer_email: str
    created_at: datetime


class ApprovalRequestCreate(BaseModel):
    title: str = Field(min_length=2, max_length=512)
    note: str = Field(default="", max_length=8000)
    assigned_to_user_id: str | None = None
    conditions: list[str] = Field(default_factory=list, max_length=20)
    due_at: datetime | None = None


class ApprovalResolutionCreate(BaseModel):
    status: Literal["approved", "conditionally_approved", "changes_requested", "rejected", "cancelled"]
    resolution_note: str = Field(min_length=5, max_length=8000)
    condition_results: dict[str, bool] = Field(default_factory=dict)


class ApprovalRequestResponse(BaseModel):
    id: str
    contract_id: str
    title: str
    note: str
    status: ApprovalStatusName
    conditions: list[str]
    condition_results: dict[str, bool]
    requested_by_user_id: str
    requested_by_name: str
    assigned_to_user_id: str | None
    assigned_to_name: str | None
    resolved_by_user_id: str | None
    resolved_by_name: str | None
    resolution_note: str
    due_at: datetime | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ExternalShareCreate(BaseModel):
    label: str = Field(default="External reviewer", min_length=2, max_length=255)
    include_evidence: bool = True
    expires_in_days: Literal[1, 3, 7, 14, 30] = 7


class ExternalShareResponse(BaseModel):
    id: str
    label: str
    include_evidence: bool
    expires_at: datetime
    revoked_at: datetime | None
    last_viewed_at: datetime | None
    view_count: int
    created_at: datetime


class ExternalShareCreatedResponse(BaseModel):
    share: ExternalShareResponse
    token: str


class SharedContractResponse(BaseModel):
    contract_title: str
    counterparty: str
    contract_type: str
    executive_summary: str
    overall_attention: str
    risks: list[dict[str, Any]]
    missing_protections: list[Any]
    negotiation_priorities: list[Any]
    expires_at: datetime
    shared_for: str


class LifecycleItemCreate(BaseModel):
    kind: LifecycleKindName
    title: str = Field(min_length=2, max_length=512)
    description: str = Field(default="", max_length=8000)
    amount: str = Field(default="", max_length=255)
    due_at: datetime
    owner_user_id: str | None = None
    reminder_days: int = Field(default=7, ge=0, le=365)
    recurrence: RecurrenceName = "none"


class LifecycleItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=512)
    description: str | None = Field(default=None, max_length=8000)
    amount: str | None = Field(default=None, max_length=255)
    due_at: datetime | None = None
    owner_user_id: str | None = None
    reminder_days: int | None = Field(default=None, ge=0, le=365)
    recurrence: RecurrenceName | None = None
    status: LifecycleStatusName | None = None


class LifecycleItemResponse(BaseModel):
    id: str
    organization_id: str
    contract_id: str
    contract_title: str
    kind: LifecycleKindName
    title: str
    description: str
    amount: str
    due_at: datetime
    owner_user_id: str | None
    owner_name: str | None
    reminder_days: int
    recurrence: RecurrenceName
    status: LifecycleStatusName
    last_notified_at: datetime | None
    escalated_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ContractActivityResponse(BaseModel):
    id: str
    action: str
    detail: dict[str, Any]
    actor_user_id: str | None
    actor_name: str
    created_at: datetime


class ContractVersionComparisonResponse(BaseModel):
    compared_to_version_id: str | None
    added: list[str]
    removed: list[str]
    changed_summary: str
    added_count: int
    removed_count: int


class ContractVersionResponse(BaseModel):
    id: str
    contract_id: str
    document_asset_id: str | None
    version_number: int
    label: str
    notes: str
    source_name: str
    sha256: str
    size_bytes: int
    comparison: ContractVersionComparisonResponse
    uploaded_by_user_id: str | None
    uploaded_by_name: str
    created_at: datetime


class NegotiationItemCreate(BaseModel):
    title: str = Field(min_length=2, max_length=512)
    description: str = Field(default="", max_length=8000)
    category: NegotiationItemCategoryName = "change"
    priority: TaskPriorityName = "normal"
    status: NegotiationItemStatusName = "proposed"
    our_position: str = Field(default="", max_length=8000)
    counterparty_position: str = Field(default="", max_length=8000)
    source_reference: dict[str, Any] = Field(default_factory=dict)


class NegotiationItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=512)
    description: str | None = Field(default=None, max_length=8000)
    category: NegotiationItemCategoryName | None = None
    priority: TaskPriorityName | None = None
    status: NegotiationItemStatusName | None = None
    our_position: str | None = Field(default=None, max_length=8000)
    counterparty_position: str | None = Field(default=None, max_length=8000)
    source_reference: dict[str, Any] | None = None


class NegotiationItemResponse(BaseModel):
    id: str
    contract_id: str
    title: str
    description: str
    category: NegotiationItemCategoryName
    priority: TaskPriorityName
    status: NegotiationItemStatusName
    our_position: str
    counterparty_position: str
    source_reference: dict[str, Any]
    created_by_user_id: str
    created_by_name: str
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime


class CounterpartyResponseCreate(BaseModel):
    responder_name: str = Field(default="", max_length=255)
    channel: str = Field(default="email", max_length=64)
    body: str = Field(min_length=2, max_length=12000)
    contract_version_id: str | None = None
    related_item_ids: list[str] = Field(default_factory=list, max_length=50)


class CounterpartyResponseResponse(BaseModel):
    id: str
    contract_id: str
    contract_version_id: str | None
    recorded_by_user_id: str
    recorded_by_name: str
    responder_name: str
    channel: str
    body: str
    related_item_ids: list[str]
    created_at: datetime


class NegotiationSummaryResponse(BaseModel):
    contract_id: str
    latest_version: ContractVersionResponse | None
    version_count: int
    checklist_count: int
    accepted_changes: list[NegotiationItemResponse]
    rejected_changes: list[NegotiationItemResponse]
    unresolved_points: list[NegotiationItemResponse]
    counterparty_response_count: int
    final_summary: str


class DealPassportResponse(BaseModel):
    contract_id: str
    title: str
    counterparty: str
    contract_type: str
    readiness: Literal["ready", "needs_attention", "blocked"]
    readiness_reasons: list[str]
    executive_summary: str
    overall_attention: str
    top_risks: list[dict[str, Any]]
    versions: list[ContractVersionResponse]
    negotiation: NegotiationSummaryResponse
    approvals: list[dict[str, Any]]
    open_actions: list[dict[str, Any]]
    key_dates: list[dict[str, Any]]
    generated_at: datetime


class PortfolioQuestionCreate(BaseModel):
    question: str = Field(min_length=3, max_length=2000)


class PortfolioQuestionSource(BaseModel):
    contract_id: str
    contract_title: str
    location: str
    excerpt: str


class PortfolioQuestionResponse(BaseModel):
    answer: str
    sources: list[PortfolioQuestionSource]
    generated_by: Literal["model", "extractive"]


class ContractResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    title: str
    source_name: str
    counterparty: str
    contract_type: str
    status: str
    review_context: dict[str, Any]
    retain_document: bool
    retain_source_text: bool
    retention_days: int
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime
    latest_job: JobResponse | None = None


class ContractCreatedResponse(BaseModel):
    contract: ContractResponse
    asset: AssetResponse
    job: JobResponse


class IntegrationConnectionCreate(BaseModel):
    provider: IntegrationProviderName
    display_name: str = Field(min_length=2, max_length=255)
    external_account_id: str = Field(default="", max_length=255)
    capabilities: list[str] = Field(default_factory=list, max_length=20)
    settings: dict[str, Any] = Field(default_factory=dict)


class IntegrationConnectionResponse(BaseModel):
    id: str
    organization_id: str
    provider: IntegrationProviderName
    display_name: str
    external_account_id: str
    status: IntegrationStatusName
    capabilities: list[str]
    settings: dict[str, Any]
    last_sync_at: datetime | None
    error_message: str
    created_by_user_id: str
    created_by_name: str
    created_at: datetime
    updated_at: datetime


class IntegrationImportResponse(BaseModel):
    id: str
    organization_id: str
    connection_id: str | None
    contract_id: str | None
    provider: IntegrationProviderName
    source_type: str
    external_id: str
    source_url: str
    title: str
    original_name: str
    content_type: str
    size_bytes: int
    sha256: str
    status: str
    metadata: dict[str, Any]
    error_message: str
    imported_by_user_id: str | None
    imported_by_name: str
    created_at: datetime
    updated_at: datetime


class IntakeCreatedResponse(BaseModel):
    import_record: IntegrationImportResponse
    contract: ContractResponse
    asset: AssetResponse
    job: JobResponse


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    scopes: list[str] = Field(default_factory=lambda: ["contracts:write", "contracts:read"], max_length=20)


class ApiKeyResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    key_prefix: str
    scopes: list[str]
    last_used_at: datetime | None
    revoked_at: datetime | None
    created_by_user_id: str
    created_by_name: str
    created_at: datetime


class ApiKeyCreatedResponse(BaseModel):
    api_key: ApiKeyResponse
    token: str


class WebhookSubscriptionCreate(BaseModel):
    target_url: str = Field(pattern=r"^https://", max_length=1024)
    description: str = Field(default="", max_length=255)
    events: list[WebhookEventName] = Field(default_factory=lambda: ["contract.review_ready"], min_length=1, max_length=10)


class WebhookSubscriptionResponse(BaseModel):
    id: str
    organization_id: str
    target_url: str
    description: str
    events: list[WebhookEventName]
    secret_prefix: str
    status: str
    last_delivery_at: datetime | None
    created_by_user_id: str
    created_by_name: str
    created_at: datetime
    updated_at: datetime


class WebhookSubscriptionCreatedResponse(BaseModel):
    subscription: WebhookSubscriptionResponse
    signing_secret: str


class WebhookDeliveryResponse(BaseModel):
    id: str
    subscription_id: str
    contract_id: str | None
    event_type: str
    payload: dict[str, Any]
    status: str
    attempts: int
    last_error: str
    delivered_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AuditEventResponse(BaseModel):
    id: str
    action: str
    detail: dict[str, Any]
    actor_user_id: str | None
    actor_name: str = ""
    actor_email: str = ""
    contract_id: str | None
    verification_case_id: str | None = None
    created_at: datetime


class ReportDistributionItem(BaseModel):
    label: str
    count: int


class ReportTimelinePoint(BaseModel):
    label: str
    period_start: datetime
    period_end: datetime
    contracts_created: int
    tasks_created: int
    tasks_completed: int
    verification_submitted: int
    decisions_recorded: int


class ReportWorkloadItem(BaseModel):
    user_id: str
    display_name: str
    email: str
    role: RoleName
    active_tasks: int
    overdue_tasks: int
    completed_in_period: int


class ReportActivityItem(BaseModel):
    id: str
    action: str
    detail: dict[str, Any]
    actor_user_id: str | None
    actor_name: str
    contract_id: str | None
    contract_title: str | None
    created_at: datetime


class ReportOverviewResponse(BaseModel):
    organization_id: str
    range: ReportRangeName
    generated_at: datetime
    period_start: datetime | None
    period_end: datetime
    contracts_total: int
    contracts_ready: int
    contracts_processing: int
    contracts_failed: int
    tasks_total: int
    tasks_active: int
    tasks_overdue: int
    tasks_due_soon: int
    tasks_completed: int
    task_completion_rate: int
    verification_total: int
    verification_pending: int
    verification_approved: int
    verification_escalated: int
    verification_rejected: int
    verification_average_risk: int
    verification_overrides: int
    audit_event_count: int
    contract_types: list[ReportDistributionItem]
    active_task_priorities: list[ReportDistributionItem]
    timeline: list[ReportTimelinePoint]
    workload: list[ReportWorkloadItem]
    recent_activity: list[ReportActivityItem]


class HealthResponse(BaseModel):
    status: str
    service: str
    environment: str
