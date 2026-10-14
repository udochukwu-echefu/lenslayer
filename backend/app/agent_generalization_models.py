"""Private retained sources and immutable bounded workflow plans/checkpoints."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base
from .models import new_id, utcnow


class ContextRecord(Base):
    __tablename__ = "agent_context_records"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ContextVersion(Base):
    __tablename__ = "agent_context_versions"
    __table_args__ = (UniqueConstraint("record_id", "version_number", name="uq_agent_context_version"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    record_id: Mapped[str] = mapped_column(ForeignKey("agent_context_records.id", ondelete="CASCADE"), index=True)
    version_number: Mapped[int] = mapped_column(Integer)
    source_sha256: Mapped[str] = mapped_column(String(64))
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ContextEvidence(Base):
    __tablename__ = "agent_context_evidence"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id", ondelete="CASCADE"), index=True)
    context_id: Mapped[str] = mapped_column(ForeignKey("agent_context_records.id", ondelete="CASCADE"), index=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("agent_context_versions.id", ondelete="CASCADE"))
    source_sha256: Mapped[str] = mapped_column(String(64))
    start_offset: Mapped[int] = mapped_column(Integer)
    end_offset: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WorkflowGraph(Base):
    __tablename__ = "agent_workflow_graphs"
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id", ondelete="CASCADE"), primary_key=True)
    plan_json: Mapped[str] = mapped_column(Text)
    plan_sha256: Mapped[str] = mapped_column(String(64))


class WorkflowGraphNode(Base):
    __tablename__ = "agent_workflow_graph_nodes"
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_workflow_graphs.run_id", ondelete="CASCADE"), primary_key=True)
    node_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    action_id: Mapped[str] = mapped_column(ForeignKey("agent_actions.id", ondelete="CASCADE"), unique=True)
    depends_on_json: Mapped[str] = mapped_column(Text)
    not_before_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), default="blocked", index=True)
