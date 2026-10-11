"""Strict, versioned developer API contracts for the first agent workflow."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Annotated, Any, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator


ToolName = Literal["documents.retrieve", "workspace.tasks.create", "google_calendar.events.create"]
RunStatus = Literal["running", "awaiting_approval", "awaiting_input", "succeeded", "failed", "cancelled"]
ActionStatus = Literal["queued", "awaiting_approval", "running", "unknown_outcome", "succeeded", "failed", "cancelled"]
Identifier = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
IdempotencyKey = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    @field_validator("*")
    @classmethod
    def utc_dates(cls, value):
        return value.astimezone(timezone.utc) if isinstance(value, datetime) else value


class CalendarTarget(StrictInput):
    connection_id: Identifier
    calendar_id: str = Field(min_length=1, max_length=1024, pattern=r"^[^\s*]+$")


class AgentCreate(StrictInput):
    name: str = Field(min_length=1, max_length=255)
    allowed_tools: list[ToolName] = Field(min_length=1, max_length=3)
    contract_ids: list[Identifier] = Field(min_length=0, max_length=100)
    assignee_ids: list[Identifier] = Field(min_length=0, max_length=100)
    calendar_targets: list[CalendarTarget] = Field(default_factory=list, max_length=100)
    require_approval: bool = True
    expires_at: AwareDatetime
    max_actions_per_run: int = Field(default=1, ge=1, le=20)

    @field_validator("allowed_tools", "contract_ids", "assignee_ids")
    @classmethod
    def unique_scope(cls, values):
        if len(values) != len(set(values)):
            raise ValueError("Scope entries must be unique.")
        return values


class AgentResponse(BaseModel):
    id: str
    organization_id: str
    delegated_by_user_id: str
    name: str
    token_prefix: str
    allowed_tools: list[ToolName]
    contract_ids: list[str]
    assignee_ids: list[str]
    calendar_targets: list[CalendarTarget] = Field(default_factory=list)
    require_approval: bool
    max_actions_per_run: int
    status: Literal["active", "expired", "revoked"]
    expires_at: datetime
    revoked_at: datetime | None
    created_at: datetime


class AgentCreatedResponse(BaseModel):
    agent: AgentResponse
    token: str


class TaskSuccessCondition(StrictInput):
    type: Literal["workspace_task_created"] = "workspace_task_created"
    contract_id: Identifier
    assigned_to_user_id: Identifier
    due_at: AwareDatetime


class CalendarSuccessCondition(CalendarTarget):
    type: Literal["calendar_event_created"] = "calendar_event_created"
    summary: str = Field(min_length=1, max_length=512)
    start_at: AwareDatetime
    end_at: AwareDatetime

    @model_validator(mode="after")
    def valid_interval(self):
        if self.end_at <= self.start_at or self.end_at - self.start_at > timedelta(days=31):
            raise ValueError("Event duration must be positive and no more than 31 days.")
        return self


class RequiredCondition(StrictInput):
    id: Identifier
    condition: TaskSuccessCondition | CalendarSuccessCondition


class CompositeSuccessCondition(StrictInput):
    type: Literal["all"] = "all"
    conditions: list[RequiredCondition] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def unique_ids(self):
        if len({entry.id for entry in self.conditions}) != len(self.conditions):
            raise ValueError("Condition IDs must be unique.")
        return self


class AgentRunCreate(StrictInput):
    idempotency_key: IdempotencyKey
    goal: str = Field(min_length=1, max_length=4000)
    contract_ids: list[Identifier] = Field(min_length=1, max_length=100)
    allowed_tools: list[ToolName] = Field(min_length=1, max_length=2)
    max_actions: int = Field(default=1, ge=1, le=20)
    deadline_at: AwareDatetime
    success_condition: TaskSuccessCondition

    @field_validator("contract_ids", "allowed_tools")
    @classmethod
    def unique_scope(cls, values):
        if len(values) != len(set(values)):
            raise ValueError("Scope entries must be unique.")
        return values


class AgentRunResponse(BaseModel):
    id: str
    organization_id: str
    agent_id: str
    idempotency_key: str
    goal: str
    execution_owner: Literal["external_agent", "lenslayer_hosted_agent"] = "external_agent"
    contract_ids: list[str]
    allowed_tools: list[ToolName]
    max_actions: int
    status: RunStatus
    success_condition: TaskSuccessCondition | CalendarSuccessCondition | CompositeSuccessCondition
    calendar_targets: list[CalendarTarget] = Field(default_factory=list)
    result: dict[str, Any]
    error_code: str
    deadline_at: datetime
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


class EvidenceRequest(StrictInput):
    contract_id: Identifier
    query: str = Field(min_length=2, max_length=200)
    version_id: Identifier | None = None


class EvidenceResponse(BaseModel):
    id: str
    contract_id: str
    version_id: str
    source_sha256: str
    excerpt: str
    start_offset: int
    end_offset: int
    created_at: datetime


class DeadlineBasis(StrictInput):
    renewal_date: date
    notice_days: int = Field(ge=0, le=3650)


class TaskActionInput(StrictInput):
    condition_id: Identifier | None = None
    contract_id: Identifier
    assigned_to_user_id: Identifier
    title: str = Field(min_length=1, max_length=512)
    description: str = Field(default="", max_length=4000)
    due_at: AwareDatetime
    evidence_id: Identifier
    deadline_basis: DeadlineBasis | None = None


class CalendarActionInput(CalendarSuccessCondition):
    # No caller-controlled event ID, attendees, recurrence, or provider options.
    type: Literal["calendar_event_created"] = "calendar_event_created"
    condition_id: Identifier | None = None
    description: str = Field(default="", max_length=4000)
    contract_id: Identifier | None = None
    evidence_id: Identifier | None = None

    @model_validator(mode="after")
    def paired_source(self):
        if (self.contract_id is None) != (self.evidence_id is None):
            raise ValueError("Document provenance requires both contract_id and evidence_id.")
        return self


class WorkflowCreate(AgentRunCreate):
    contract_ids: list[Identifier] = Field(default_factory=list, min_length=0, max_length=100)
    allowed_tools: list[ToolName] = Field(min_length=1, max_length=3)
    calendar_targets: list[CalendarTarget] = Field(default_factory=list, max_length=100)
    success_condition: TaskSuccessCondition | CalendarSuccessCondition | CompositeSuccessCondition


class WorkflowActionCreate(StrictInput):
    idempotency_key: IdempotencyKey
    tool: Literal["workspace.tasks.create", "google_calendar.events.create"]
    tool_version: Literal["1"] = "1"
    input: TaskActionInput | CalendarActionInput

    @model_validator(mode="after")
    def matching_input(self):
        if (self.tool == "workspace.tasks.create") != isinstance(self.input, TaskActionInput):
            raise ValueError("Input does not match tool.")
        return self


class InputField(StrictInput):
    name: str = Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")
    type: Literal["text", "date_time", "integer", "boolean"]
    prompt: str = Field(min_length=1, max_length=512)


class InputRequestCreate(StrictInput):
    idempotency_key: IdempotencyKey
    reason: str = Field(min_length=1, max_length=1000)
    fields: list[InputField] = Field(min_length=1, max_length=20)
    expires_at: AwareDatetime
    responder: Literal["human", "agent"] = "human"

    @model_validator(mode="after")
    def unique_fields(self):
        if len({f.name for f in self.fields}) != len(self.fields):
            raise ValueError("Input names must be unique.")
        if any(any(s in f.name for s in ("token", "secret", "password", "credential")) for f in self.fields):
            raise ValueError("Input requests must not collect credentials.")
        return self


class InputSupply(StrictInput):
    values: dict[str, str | int | bool] = Field(min_length=1, max_length=20)


class InputRequestResponse(BaseModel):
    id: str
    run_id: str
    request: InputRequestCreate
    status: Literal["pending", "supplied", "expired"]
    values: dict[str, Any]
    supplied_by_user_id: str | None
    supplied_by_agent_id: str | None
    supplied_at: datetime | None
    created_at: datetime


class AgentActionCreate(StrictInput):
    idempotency_key: IdempotencyKey
    tool: Literal["workspace.tasks.create"]
    input: TaskActionInput


class ApprovalDecision(StrictInput):
    decision: Literal["approved", "rejected"]
    reason: str = Field(min_length=1, max_length=2000)


class AgentActionResponse(BaseModel):
    id: str
    run_id: str
    idempotency_key: str
    tool: str
    tool_version: str
    input: TaskActionInput | CalendarActionInput
    input_sha256: str
    status: ActionStatus
    attempts: int
    approval_status: Literal["not_required", "pending", "approved", "rejected"]
    approved_by_user_id: str | None
    approval_reason: str
    approval_expires_at: datetime | None
    result: dict[str, Any]
    error_code: str
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


class AgentEventResponse(BaseModel):
    id: str
    run_id: str
    sequence: int
    type: str
    data: dict[str, Any]
    created_at: datetime


class ToolResponse(BaseModel):
    name: ToolName
    version: str = "1"
    description: str
    requires_approval: bool
    input_schema: dict[str, Any]


class CalendarOAuthStartResponse(BaseModel):
    authorization_url: str
    expires_at: datetime


class CalendarDisconnectResponse(BaseModel):
    connection_id: str
    status: Literal["revoked"]
    provider_revocation_pending: bool


class AgentMetricsResponse(BaseModel):
    runs_by_status: dict[str, int]
    actions_by_status: dict[str, int]
    event_counters: dict[str, int]
    expired_action_leases: int
    retry_attempts: int
    oldest_queued_action_age_seconds: float
    pending_provider_revocations: int
    observed_at: datetime


class WorkerHealthResponse(BaseModel):
    status: Literal["ready"]
    service: Literal["platform-worker"]
    heartbeat_age_seconds: float
