"""Durable agent control-plane records, independent of contract review jobs."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base
from .models import new_id, utcnow


class AgentPrincipal(Base):
    __tablename__ = "agent_principals"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    delegated_by_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    token_prefix: Mapped[str] = mapped_column(String(20))
    allowed_tools_json: Mapped[str] = mapped_column(Text)
    contract_ids_json: Mapped[str] = mapped_column(Text)
    assignee_ids_json: Mapped[str] = mapped_column(Text)
    calendar_targets_json: Mapped[str] = mapped_column(Text, default="[]", server_default="[]")
    require_approval: Mapped[bool] = mapped_column(Boolean, default=True)
    max_actions_per_run: Mapped[int] = mapped_column(Integer, default=1)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AgentWorkerHeartbeat(Base):
    __tablename__ = "agent_worker_heartbeats"
    worker_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    lane: Mapped[str] = mapped_column(String(32), default="mixed", server_default="mixed", index=True)


class AgentRun(Base):
    __tablename__ = "agent_runs"
    __table_args__ = (UniqueConstraint("agent_id", "idempotency_key", name="uq_agent_run_key"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agent_principals.id", ondelete="CASCADE"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(128))
    request_sha256: Mapped[str] = mapped_column(String(64))
    goal: Mapped[str] = mapped_column(Text)
    execution_owner: Mapped[str] = mapped_column(String(32), default="external_agent", server_default="external_agent")
    contract_ids_json: Mapped[str] = mapped_column(Text)
    allowed_tools_json: Mapped[str] = mapped_column(Text)
    success_condition_json: Mapped[str] = mapped_column(Text)
    calendar_targets_json: Mapped[str] = mapped_column(Text, default="[]", server_default="[]")
    max_actions: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), default="running", index=True)
    result_json: Mapped[str] = mapped_column(Text, default="{}")
    error_code: Mapped[str] = mapped_column(String(64), default="")
    event_sequence: Mapped[int] = mapped_column(Integer, default=0)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AgentInputRequest(Base):
    __tablename__ = "agent_input_requests"
    __table_args__ = (UniqueConstraint("run_id", "idempotency_key", name="uq_agent_input_key"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(128))
    request_json: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    values_json: Mapped[str] = mapped_column(Text, default="{}")
    supplied_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("platform_users.id"), nullable=True)
    supplied_by_agent_id: Mapped[str | None] = mapped_column(ForeignKey("agent_principals.id"), nullable=True)
    supplied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AgentRunEvent(Base):
    __tablename__ = "agent_run_events"
    __table_args__ = (UniqueConstraint("run_id", "sequence", name="uq_agent_event_sequence"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String(64))
    data_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AgentEvidence(Base):
    __tablename__ = "agent_evidence"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey("platform_contracts.id", ondelete="CASCADE"), index=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("contract_versions.id", ondelete="CASCADE"), index=True)
    source_sha256: Mapped[str] = mapped_column(String(64))
    start_offset: Mapped[int] = mapped_column(Integer)
    end_offset: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AgentAction(Base):
    """An immutable invocation and durable dispatch outbox in the same record."""

    __tablename__ = "agent_actions"
    __table_args__ = (UniqueConstraint("run_id", "idempotency_key", name="uq_agent_action_key"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(128))
    tool: Mapped[str] = mapped_column(String(128))
    tool_version: Mapped[str] = mapped_column(String(32), default="1")
    input_json: Mapped[str] = mapped_column(Text)
    input_sha256: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), index=True)
    output_id: Mapped[str] = mapped_column(String(64), default=new_id, unique=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    lease_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    dispatch_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dispatch_intent_json: Mapped[str] = mapped_column(Text, default="{}", server_default="{}")
    approval_status: Mapped[str] = mapped_column(String(32), default="not_required")
    approved_input_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    approved_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("platform_users.id"), nullable=True)
    approval_reason: Mapped[str] = mapped_column(Text, default="")
    approval_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result_json: Mapped[str] = mapped_column(Text, default="{}")
    error_code: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
