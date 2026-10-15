"""Fixed-fact human task contracts, separate from external agent API inputs."""
from datetime import datetime
from typing import Literal

from pydantic import AwareDatetime, ConfigDict, Field, model_validator

from .agent_schemas import CalendarSuccessCondition, Identifier, IdempotencyKey, StrictInput

GoalType = Literal["retained-document-follow-up", "calendar-event", "follow-up-and-calendar"]
PlannerMode = Literal["deterministic", "model"]
HostedStatus = Literal["queued", "planning", "awaiting_input", "awaiting_approval", "running", "succeeded", "failed", "cancelled"]
GOAL_TYPES = ["retained-document-follow-up", "calendar-event", "follow-up-and-calendar"]


class HostedTaskCreate(StrictInput):
    idempotency_key: IdempotencyKey
    goal_type: GoalType
    goal: str = Field(min_length=1, max_length=4000)
    deadline_at: AwareDatetime
    contract_id: Identifier | None = None
    version_id: Identifier | None = None
    query: str = Field(default="notice", min_length=2, max_length=200)
    assignee_id: Identifier | None = None
    due_at: AwareDatetime | None = None
    task_title: str = Field(default="Review document follow-up", min_length=1, max_length=512)
    task_description: str = Field(default="", max_length=4000)
    calendar: CalendarSuccessCondition | None = None
    planner_mode: PlannerMode = "deterministic"
    expected_model_provider: Literal["deepseek", "openai"] | None = None
    expected_model_id: Literal["deepseek-flash", "gpt-6.1-sol"] | None = None
    expected_model_reasoning_effort: Literal["high"] | None = None

    @model_validator(mode="after")
    def exact_goal_facts(self):
        expected = (self.expected_model_provider, self.expected_model_id, self.expected_model_reasoning_effort)
        if self.planner_mode == "model" and any(value is None for value in expected):
            raise ValueError("Model mode requires the exact disclosed provider/model/high-effort expectation.")
        if self.planner_mode == "deterministic" and any(value is not None for value in expected):
            raise ValueError("Deterministic mode must not claim a model selection.")
        document_fields = {"contract_id", "version_id", "query", "assignee_id", "due_at", "task_title", "task_description"}
        if self.goal_type == "calendar-event":
            if self.model_fields_set & document_fields:
                raise ValueError("Calendar-only goals must not include document/task fields.")
        elif not all((self.contract_id, self.assignee_id, self.due_at)):
            raise ValueError("Document goals require contract_id, assignee_id and due_at.")
        if self.goal_type == "retained-document-follow-up":
            if "calendar" in self.model_fields_set:
                raise ValueError("Document-only goals must not include calendar fields.")
        elif self.calendar is None:
            raise ValueError("Calendar goals require an exact calendar condition.")
        return self

    def facts(self):
        """Canonical input excludes irrelevant defaults, so it remains valid on restart."""
        values = self.model_dump(mode="json")
        if self.planner_mode == "deterministic":
            for key in ("expected_model_provider", "expected_model_id", "expected_model_reasoning_effort"):
                values.pop(key)
        if self.goal_type == "calendar-event":
            for key in ("contract_id", "version_id", "query", "assignee_id", "due_at", "task_title", "task_description"):
                values.pop(key)
        elif self.goal_type == "retained-document-follow-up":
            values.pop("calendar")
        return values


class HostedTaskResponse(StrictInput):
    id: str
    organization_id: str
    created_by_user_id: str
    goal_type: GoalType
    goal: str
    planner_mode: PlannerMode
    model_provider: Literal["deepseek", "openai"] | None = None
    model_id: Literal["deepseek-flash", "gpt-6.1-sol"] | None = None
    model_reasoning_effort: Literal["high"] | None = None
    status: HostedStatus
    phase: str
    run_id: str | None
    agent_id: str | None
    error_code: str
    deadline_at: datetime
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


class HostedCapabilities(StrictInput):
    enabled: bool
    goal_types: list[GoalType]
    planner_modes: list[PlannerMode]
    max_deadline_days: Literal[7] = 7
    model_provider: Literal["deepseek", "openai"] | None = None
    model_id: Literal["deepseek-flash", "gpt-6.1-sol"] | None = None
    model_reasoning_effort: Literal["high"] | None = None
    model_excerpt_max_chars: Literal[1000] = 1000
    model_disclosure: str | None = None


class ModelDecision(StrictInput):
    model_config = ConfigDict(extra="forbid", strict=True)
    decision: Literal["proceed", "needs_input", "decline"]
