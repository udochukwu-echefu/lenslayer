"""collaboration and lifecycle

Revision ID: f3b8c2d74a10
Revises: e2f5a7c91d44
"""

from collections.abc import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "f3b8c2d74a10"
down_revision: Union[str, Sequence[str], None] = "e2f5a7c91d44"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _audit_columns() -> list[sa.Column]:
    return [
        sa.Column("organization_id", sa.String(length=64), nullable=False),
        sa.Column("contract_id", sa.String(length=64), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "contract_comments",
        sa.Column("id", sa.String(length=64), primary_key=True),
        *_audit_columns(),
        sa.Column("author_user_id", sa.String(length=64), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("mentions_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contract_id"], ["platform_contracts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_user_id"], ["platform_users.id"]),
    )
    op.create_table(
        "contract_decisions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        *_audit_columns(),
        sa.Column("reviewer_user_id", sa.String(length=64), nullable=False),
        sa.Column("decision", sa.String(length=32), nullable=False),
        sa.Column("subject", sa.String(length=512), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("source_reference_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contract_id"], ["platform_contracts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewer_user_id"], ["platform_users.id"]),
    )
    op.create_table(
        "approval_requests",
        sa.Column("id", sa.String(length=64), primary_key=True),
        *_audit_columns(),
        sa.Column("requested_by_user_id", sa.String(length=64), nullable=False),
        sa.Column("assigned_to_user_id", sa.String(length=64), nullable=True),
        sa.Column("resolved_by_user_id", sa.String(length=64), nullable=True),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("conditions_json", sa.Text(), nullable=False),
        sa.Column("condition_results_json", sa.Text(), nullable=False),
        sa.Column("resolution_note", sa.Text(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contract_id"], ["platform_contracts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["platform_users.id"]),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["platform_users.id"]),
        sa.ForeignKeyConstraint(["resolved_by_user_id"], ["platform_users.id"]),
    )
    op.create_table(
        "external_shares",
        sa.Column("id", sa.String(length=64), primary_key=True),
        *_audit_columns(),
        sa.Column("created_by_user_id", sa.String(length=64), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("include_evidence", sa.Boolean(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_viewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("view_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contract_id"], ["platform_contracts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["platform_users.id"]),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_table(
        "contract_lifecycle_items",
        sa.Column("id", sa.String(length=64), primary_key=True),
        *_audit_columns(),
        sa.Column("created_by_user_id", sa.String(length=64), nullable=False),
        sa.Column("owner_user_id", sa.String(length=64), nullable=True),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("amount", sa.String(length=255), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reminder_days", sa.Integer(), nullable=False),
        sa.Column("recurrence", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("last_notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("escalated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contract_id"], ["platform_contracts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["platform_users.id"]),
        sa.ForeignKeyConstraint(["owner_user_id"], ["platform_users.id"]),
    )
    for table, columns in {
        "contract_comments": ["organization_id", "contract_id", "author_user_id", "created_at"],
        "contract_decisions": ["organization_id", "contract_id", "reviewer_user_id", "decision", "created_at"],
        "approval_requests": ["organization_id", "contract_id", "assigned_to_user_id", "status", "due_at", "created_at"],
        "external_shares": ["organization_id", "contract_id", "created_by_user_id", "token_hash", "expires_at", "created_at"],
        "contract_lifecycle_items": ["organization_id", "contract_id", "owner_user_id", "kind", "due_at", "recurrence", "status", "created_at"],
    }.items():
        for column in columns:
            op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade() -> None:
    for table in (
        "contract_lifecycle_items",
        "external_shares",
        "approval_requests",
        "contract_decisions",
        "contract_comments",
    ):
        op.drop_table(table)
