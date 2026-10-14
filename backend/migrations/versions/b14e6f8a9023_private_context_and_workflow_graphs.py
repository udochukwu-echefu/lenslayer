"""Add private context sources and immutable bounded workflow graphs.

Revision ID: b14e6f8a9023
Revises: ab3d5e7f9012
"""
from alembic import op
import sqlalchemy as sa

revision = "b14e6f8a9023"
down_revision = "ab3d5e7f9012"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("agent_principals", "agent_runs"):
        op.add_column(table, sa.Column("context_ids_json", sa.Text(), nullable=False, server_default="[]"))
    op.create_table("agent_context_records",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("organization_id", sa.String(64), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("current_version", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    for column in ("organization_id", "expires_at"):
        op.create_index("ix_agent_context_records_" + column, "agent_context_records", [column])
    op.create_table("agent_context_versions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("record_id", sa.String(64), sa.ForeignKey("agent_context_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("source_sha256", sa.String(64), nullable=False),
        sa.Column("text", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("record_id", "version_number", name="uq_agent_context_version"))
    op.create_index("ix_agent_context_versions_record_id", "agent_context_versions", ["record_id"])
    op.create_table("agent_context_evidence",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("run_id", sa.String(64), sa.ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("context_id", sa.String(64), sa.ForeignKey("agent_context_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", sa.String(64), sa.ForeignKey("agent_context_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_sha256", sa.String(64), nullable=False),
        sa.Column("start_offset", sa.Integer(), nullable=False),
        sa.Column("end_offset", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    for column in ("run_id", "context_id"):
        op.create_index("ix_agent_context_evidence_" + column, "agent_context_evidence", [column])
    op.create_table("agent_workflow_graphs",
        sa.Column("run_id", sa.String(64), sa.ForeignKey("agent_runs.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("plan_json", sa.Text(), nullable=False),
        sa.Column("plan_sha256", sa.String(64), nullable=False))
    op.create_table("agent_workflow_graph_nodes",
        sa.Column("run_id", sa.String(64), sa.ForeignKey("agent_workflow_graphs.run_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("node_id", sa.String(64), primary_key=True),
        sa.Column("action_id", sa.String(64), sa.ForeignKey("agent_actions.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("depends_on_json", sa.Text(), nullable=False),
        sa.Column("not_before_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False))
    op.create_index("ix_agent_workflow_graph_nodes_status", "agent_workflow_graph_nodes", ["status"])


def downgrade():
    for table in ("agent_workflow_graph_nodes", "agent_workflow_graphs", "agent_context_evidence",
                  "agent_context_versions", "agent_context_records"):
        op.drop_table(table)
    for table in ("agent_runs", "agent_principals"):
        op.drop_column(table, "context_ids_json")
