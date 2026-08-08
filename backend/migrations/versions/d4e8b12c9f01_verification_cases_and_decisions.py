"""verification cases and human decisions

Revision ID: d4e8b12c9f01
Revises: a71c3e9462bd
Create Date: 2026-07-23 09:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e8b12c9f01"
down_revision: Union[str, Sequence[str], None] = "a71c3e9462bd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "verification_cases",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("organization_id", sa.String(length=64), nullable=False),
        sa.Column("seeded_by_user_id", sa.String(length=64), nullable=False),
        sa.Column("reference", sa.String(length=128), nullable=False),
        sa.Column("applicant_name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("risk_score", sa.Integer(), nullable=False),
        sa.Column("suggested_action", sa.String(length=32), nullable=False),
        sa.Column("finding_count", sa.Integer(), nullable=False),
        sa.Column("document_count", sa.Integer(), nullable=False),
        sa.Column("average_confidence", sa.Integer(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_json", sa.Text(), nullable=False),
        sa.Column("evaluation_json", sa.Text(), nullable=False),
        sa.Column("synthetic", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["seeded_by_user_id"], ["platform_users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "reference", name="uq_verification_case_org_reference"),
    )
    op.create_index(op.f("ix_verification_cases_applicant_name"), "verification_cases", ["applicant_name"], unique=False)
    op.create_index(op.f("ix_verification_cases_organization_id"), "verification_cases", ["organization_id"], unique=False)
    op.create_index(op.f("ix_verification_cases_reference"), "verification_cases", ["reference"], unique=False)
    op.create_index(op.f("ix_verification_cases_risk_score"), "verification_cases", ["risk_score"], unique=False)
    op.create_index(op.f("ix_verification_cases_seeded_by_user_id"), "verification_cases", ["seeded_by_user_id"], unique=False)
    op.create_index(op.f("ix_verification_cases_status"), "verification_cases", ["status"], unique=False)
    op.create_index(op.f("ix_verification_cases_submitted_at"), "verification_cases", ["submitted_at"], unique=False)
    op.create_index(op.f("ix_verification_cases_suggested_action"), "verification_cases", ["suggested_action"], unique=False)

    op.create_table(
        "verification_decisions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("organization_id", sa.String(length=64), nullable=False),
        sa.Column("verification_case_id", sa.String(length=64), nullable=False),
        sa.Column("reviewer_user_id", sa.String(length=64), nullable=False),
        sa.Column("decision", sa.String(length=32), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("recommended_action", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewer_user_id"], ["platform_users.id"]),
        sa.ForeignKeyConstraint(["verification_case_id"], ["verification_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_verification_decisions_created_at"), "verification_decisions", ["created_at"], unique=False)
    op.create_index(op.f("ix_verification_decisions_decision"), "verification_decisions", ["decision"], unique=False)
    op.create_index(op.f("ix_verification_decisions_organization_id"), "verification_decisions", ["organization_id"], unique=False)
    op.create_index(op.f("ix_verification_decisions_reviewer_user_id"), "verification_decisions", ["reviewer_user_id"], unique=False)
    op.create_index(op.f("ix_verification_decisions_verification_case_id"), "verification_decisions", ["verification_case_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_verification_decisions_verification_case_id"), table_name="verification_decisions")
    op.drop_index(op.f("ix_verification_decisions_reviewer_user_id"), table_name="verification_decisions")
    op.drop_index(op.f("ix_verification_decisions_organization_id"), table_name="verification_decisions")
    op.drop_index(op.f("ix_verification_decisions_decision"), table_name="verification_decisions")
    op.drop_index(op.f("ix_verification_decisions_created_at"), table_name="verification_decisions")
    op.drop_table("verification_decisions")

    op.drop_index(op.f("ix_verification_cases_suggested_action"), table_name="verification_cases")
    op.drop_index(op.f("ix_verification_cases_submitted_at"), table_name="verification_cases")
    op.drop_index(op.f("ix_verification_cases_status"), table_name="verification_cases")
    op.drop_index(op.f("ix_verification_cases_seeded_by_user_id"), table_name="verification_cases")
    op.drop_index(op.f("ix_verification_cases_risk_score"), table_name="verification_cases")
    op.drop_index(op.f("ix_verification_cases_reference"), table_name="verification_cases")
    op.drop_index(op.f("ix_verification_cases_organization_id"), table_name="verification_cases")
    op.drop_index(op.f("ix_verification_cases_applicant_name"), table_name="verification_cases")
    op.drop_table("verification_cases")
