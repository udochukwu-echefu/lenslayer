"""Durable hosted fixed-fact tasks and agent-capable worker lane.

Revision ID: ab3d5e7f9012
Revises: 9a2b4c6d8e10
"""
from alembic import op
import sqlalchemy as sa

revision = "ab3d5e7f9012"
down_revision = "9a2b4c6d8e10"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("agent_runs", sa.Column("execution_owner", sa.String(32), nullable=False, server_default="external_agent"))
    op.add_column("agent_worker_heartbeats", sa.Column("lane", sa.String(32), nullable=False, server_default="mixed"))
    op.create_index("ix_agent_worker_heartbeats_lane", "agent_worker_heartbeats", ["lane"])
    op.create_table("hosted_agent_tasks",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("organization_id", sa.String(64), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_user_id", sa.String(64), sa.ForeignKey("platform_users.id"), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_json", sa.Text(), nullable=False),
        sa.Column("request_sha256", sa.String(64), nullable=False),
        sa.Column("goal_type", sa.String(32), nullable=False),
        sa.Column("goal", sa.Text(), nullable=False),
        sa.Column("planner_mode", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("phase", sa.String(32), nullable=False),
        sa.Column("run_id", sa.String(64), sa.ForeignKey("agent_runs.id", ondelete="SET NULL"), unique=True),
        sa.Column("agent_id", sa.String(64), sa.ForeignKey("agent_principals.id", ondelete="SET NULL"), unique=True),
        sa.Column("evidence_id", sa.String(64)),
        sa.Column("input_request_id", sa.String(64)),
        sa.Column("model_state", sa.String(32), nullable=False),
        sa.Column("model_calls", sa.Integer(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("lease_token", sa.String(64)),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True)),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("error_code", sa.String(64), nullable=False),
        sa.Column("deadline_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("organization_id", "idempotency_key", name="uq_hosted_task_key"))
    for column in ("organization_id", "created_by_user_id", "status", "lease_expires_at", "next_attempt_at", "deadline_at", "created_at"):
        op.create_index("ix_hosted_agent_tasks_" + column, "hosted_agent_tasks", [column])


def downgrade():
    op.drop_table("hosted_agent_tasks")
    op.drop_index("ix_agent_worker_heartbeats_lane", table_name="agent_worker_heartbeats")
    op.drop_column("agent_worker_heartbeats", "lane")
    op.drop_column("agent_runs", "execution_owner")
