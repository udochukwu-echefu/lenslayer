"""workflow tasks and due dates

Revision ID: a71c3e9462bd
Revises: 5c2f8d1a7b30
Create Date: 2026-07-22 18:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a71c3e9462bd"
down_revision: Union[str, Sequence[str], None] = "5c2f8d1a7b30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workflow_tasks",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("organization_id", sa.String(length=64), nullable=False),
        sa.Column("contract_id", sa.String(length=64), nullable=True),
        sa.Column("created_by_user_id", sa.String(length=64), nullable=False),
        sa.Column("assigned_to_user_id", sa.String(length=64), nullable=True),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("priority", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_kind", sa.String(length=64), nullable=False),
        sa.Column("source_reference_json", sa.Text(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["platform_users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["contract_id"], ["platform_contracts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["platform_users.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_workflow_tasks_assigned_to_user_id"), "workflow_tasks", ["assigned_to_user_id"], unique=False)
    op.create_index(op.f("ix_workflow_tasks_category"), "workflow_tasks", ["category"], unique=False)
    op.create_index(op.f("ix_workflow_tasks_contract_id"), "workflow_tasks", ["contract_id"], unique=False)
    op.create_index(op.f("ix_workflow_tasks_created_by_user_id"), "workflow_tasks", ["created_by_user_id"], unique=False)
    op.create_index(op.f("ix_workflow_tasks_due_at"), "workflow_tasks", ["due_at"], unique=False)
    op.create_index(op.f("ix_workflow_tasks_organization_id"), "workflow_tasks", ["organization_id"], unique=False)
    op.create_index(op.f("ix_workflow_tasks_priority"), "workflow_tasks", ["priority"], unique=False)
    op.create_index(op.f("ix_workflow_tasks_status"), "workflow_tasks", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_workflow_tasks_status"), table_name="workflow_tasks")
    op.drop_index(op.f("ix_workflow_tasks_priority"), table_name="workflow_tasks")
    op.drop_index(op.f("ix_workflow_tasks_organization_id"), table_name="workflow_tasks")
    op.drop_index(op.f("ix_workflow_tasks_due_at"), table_name="workflow_tasks")
    op.drop_index(op.f("ix_workflow_tasks_created_by_user_id"), table_name="workflow_tasks")
    op.drop_index(op.f("ix_workflow_tasks_contract_id"), table_name="workflow_tasks")
    op.drop_index(op.f("ix_workflow_tasks_category"), table_name="workflow_tasks")
    op.drop_index(op.f("ix_workflow_tasks_assigned_to_user_id"), table_name="workflow_tasks")
    op.drop_table("workflow_tasks")
