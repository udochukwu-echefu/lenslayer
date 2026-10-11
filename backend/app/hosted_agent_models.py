"""One durable bounded hosted planner, with metadata-only checkpoints."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base
from .models import new_id, utcnow


class HostedAgentTask(Base):
    __tablename__ = "hosted_agent_tasks"
    __table_args__ = (UniqueConstraint("organization_id", "idempotency_key", name="uq_hosted_task_key"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("platform_users.id"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(128))
    request_json: Mapped[str] = mapped_column(Text)
    request_sha256: Mapped[str] = mapped_column(String(64))
    goal_type: Mapped[str] = mapped_column(String(32))
    goal: Mapped[str] = mapped_column(Text)
    planner_mode: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    phase: Mapped[str] = mapped_column(String(32), default="initialize")
    run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id", ondelete="SET NULL"), nullable=True, unique=True)
    agent_id: Mapped[str | None] = mapped_column(ForeignKey("agent_principals.id", ondelete="SET NULL"), nullable=True, unique=True)
    evidence_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    input_request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_state: Mapped[str] = mapped_column(String(32), default="not_called")
    model_calls: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    lease_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    error_code: Mapped[str] = mapped_column(String(64), default="")
    deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
