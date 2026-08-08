"""team membership and invitations

Revision ID: 5c2f8d1a7b30
Revises: 97869c0f2a59
Create Date: 2026-07-22 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "5c2f8d1a7b30"
down_revision: Union[str, Sequence[str], None] = "97869c0f2a59"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "organization_invitations",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("organization_id", sa.String(length=64), nullable=False),
        sa.Column("created_by_user_id", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["platform_users.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_organization_invitations_created_by_user_id"), "organization_invitations", ["created_by_user_id"], unique=False)
    op.create_index(op.f("ix_organization_invitations_email"), "organization_invitations", ["email"], unique=False)
    op.create_index(op.f("ix_organization_invitations_expires_at"), "organization_invitations", ["expires_at"], unique=False)
    op.create_index(op.f("ix_organization_invitations_organization_id"), "organization_invitations", ["organization_id"], unique=False)
    op.create_index(op.f("ix_organization_invitations_token_hash"), "organization_invitations", ["token_hash"], unique=True)

    op.execute("UPDATE organization_memberships SET role = 'reviewer' WHERE role = 'member'")


def downgrade() -> None:
    op.execute("UPDATE organization_memberships SET role = 'member' WHERE role = 'reviewer'")
    op.drop_index(op.f("ix_organization_invitations_token_hash"), table_name="organization_invitations")
    op.drop_index(op.f("ix_organization_invitations_organization_id"), table_name="organization_invitations")
    op.drop_index(op.f("ix_organization_invitations_expires_at"), table_name="organization_invitations")
    op.drop_index(op.f("ix_organization_invitations_email"), table_name="organization_invitations")
    op.drop_index(op.f("ix_organization_invitations_created_by_user_id"), table_name="organization_invitations")
    op.drop_table("organization_invitations")
