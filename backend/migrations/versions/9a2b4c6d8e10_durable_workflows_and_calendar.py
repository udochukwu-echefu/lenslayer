"""Bounded composite workflows, input records and encrypted Calendar OAuth.

Revision ID: 9a2b4c6d8e10
Revises: 8f1a3c5e7b90
"""
from alembic import op
import sqlalchemy as sa

revision = "9a2b4c6d8e10"
down_revision = "8f1a3c5e7b90"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("agent_worker_heartbeats",
        sa.Column("worker_id", sa.String(64), primary_key=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_agent_worker_heartbeats_last_seen_at", "agent_worker_heartbeats", ["last_seen_at"])
    for table in ("agent_principals", "agent_runs"):
        op.add_column(table, sa.Column("calendar_targets_json", sa.Text(), nullable=False, server_default="[]"))
    op.add_column("agent_actions", sa.Column("dispatch_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("agent_actions", sa.Column("dispatch_intent_json", sa.Text(), nullable=False, server_default="{}"))
    op.create_table("agent_input_requests",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("run_id", sa.String(64), sa.ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_json", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("values_json", sa.Text(), nullable=False),
        sa.Column("supplied_by_user_id", sa.String(64), sa.ForeignKey("platform_users.id")),
        sa.Column("supplied_by_agent_id", sa.String(64), sa.ForeignKey("agent_principals.id")),
        sa.Column("supplied_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("run_id", "idempotency_key", name="uq_agent_input_key"))
    op.create_index("ix_agent_input_requests_run_id", "agent_input_requests", ["run_id"])
    op.create_table("calendar_credentials",
        sa.Column("connection_id", sa.String(64), sa.ForeignKey("integration_connections.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("organization_id", sa.String(64), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("encrypted_json", sa.Text(), nullable=False),
        sa.Column("scopes_json", sa.Text(), nullable=False),
        sa.Column("calendar_ids_json", sa.Text(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("revoke_pending", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_calendar_credentials_organization_id", "calendar_credentials", ["organization_id"])
    op.create_table("calendar_oauth_states",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("state_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("organization_id", sa.String(64), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("platform_users.id"), nullable=False),
        sa.Column("request_json", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True)))
    op.create_index("ix_calendar_oauth_states_organization_id", "calendar_oauth_states", ["organization_id"])


def downgrade():
    for table in ("calendar_oauth_states", "calendar_credentials", "agent_input_requests", "agent_worker_heartbeats"):
        op.drop_table(table)
    for column in ("dispatch_intent_json", "dispatch_started_at"):
        op.drop_column("agent_actions", column)
    for table in ("agent_runs", "agent_principals"):
        op.drop_column(table, "calendar_targets_json")
