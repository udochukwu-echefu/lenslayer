"""Agent delegation, durable runs, source receipts, and action dispatch.

Revision ID: 6e8a2b4d9c10
Revises: 4d2c8f1a9e77
"""
from alembic import op
import sqlalchemy as sa


revision = "6e8a2b4d9c10"
down_revision = "4d2c8f1a9e77"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_principals",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("organization_id", sa.String(64), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("delegated_by_user_id", sa.String(64), sa.ForeignKey("platform_users.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("token_prefix", sa.String(20), nullable=False),
        sa.Column("allowed_tools_json", sa.Text(), nullable=False),
        sa.Column("contract_ids_json", sa.Text(), nullable=False),
        sa.Column("assignee_ids_json", sa.Text(), nullable=False),
        sa.Column("require_approval", sa.Boolean(), nullable=False),
        sa.Column("max_actions_per_run", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    for name in ("organization_id", "delegated_by_user_id", "expires_at"):
        op.create_index(f"ix_agent_principals_{name}", "agent_principals", [name])
    op.create_table(
        "agent_runs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("organization_id", sa.String(64), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_id", sa.String(64), sa.ForeignKey("agent_principals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_sha256", sa.String(64), nullable=False),
        sa.Column("goal", sa.Text(), nullable=False),
        sa.Column("contract_ids_json", sa.Text(), nullable=False),
        sa.Column("allowed_tools_json", sa.Text(), nullable=False),
        sa.Column("success_condition_json", sa.Text(), nullable=False),
        sa.Column("max_actions", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("result_json", sa.Text(), nullable=False),
        sa.Column("error_code", sa.String(64), nullable=False),
        sa.Column("event_sequence", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("agent_id", "idempotency_key", name="uq_agent_run_key"),
    )
    for name in ("organization_id", "agent_id", "status", "deadline_at", "created_at"):
        op.create_index(f"ix_agent_runs_{name}", "agent_runs", [name])
    op.create_table(
        "agent_run_events",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("run_id", sa.String(64), sa.ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("data_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("run_id", "sequence", name="uq_agent_event_sequence"),
    )
    op.create_index("ix_agent_run_events_run_id", "agent_run_events", ["run_id"])
    op.create_table(
        "agent_evidence",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("run_id", sa.String(64), sa.ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contract_id", sa.String(64), sa.ForeignKey("platform_contracts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", sa.String(64), sa.ForeignKey("contract_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_sha256", sa.String(64), nullable=False),
        sa.Column("start_offset", sa.Integer(), nullable=False),
        sa.Column("end_offset", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    for name in ("run_id", "contract_id", "version_id"):
        op.create_index(f"ix_agent_evidence_{name}", "agent_evidence", [name])
    op.create_table(
        "agent_actions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("run_id", sa.String(64), sa.ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("tool", sa.String(128), nullable=False),
        sa.Column("tool_version", sa.String(32), nullable=False),
        sa.Column("input_json", sa.Text(), nullable=False),
        sa.Column("input_sha256", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("output_id", sa.String(64), nullable=False, unique=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("lease_token", sa.String(64)),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("approval_status", sa.String(32), nullable=False),
        sa.Column("approved_input_sha256", sa.String(64)),
        sa.Column("approved_by_user_id", sa.String(64), sa.ForeignKey("platform_users.id")),
        sa.Column("approval_reason", sa.Text(), nullable=False),
        sa.Column("approval_expires_at", sa.DateTime(timezone=True)),
        sa.Column("result_json", sa.Text(), nullable=False),
        sa.Column("error_code", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("run_id", "idempotency_key", name="uq_agent_action_key"),
    )
    for name in ("run_id", "status", "lease_expires_at"):
        op.create_index(f"ix_agent_actions_{name}", "agent_actions", [name])


def downgrade() -> None:
    for table in ("agent_actions", "agent_evidence", "agent_run_events", "agent_runs", "agent_principals"):
        op.drop_table(table)
