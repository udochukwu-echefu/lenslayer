"""verification operations and secure intake

Revision ID: c31f9a8e4d62
Revises: b92a4f7c6d15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c31f9a8e4d62"
down_revision: Union[str, Sequence[str], None] = "b92a4f7c6d15"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("verification_cases") as batch:
        batch.add_column(sa.Column("applicant_email", sa.String(length=320), nullable=False, server_default=""))
        batch.add_column(sa.Column("priority", sa.String(length=32), nullable=False, server_default="normal"))
        batch.add_column(sa.Column("assigned_to_user_id", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("intake_channel", sa.String(length=64), nullable=False, server_default="dashboard"))
        batch.add_column(sa.Column("retention_days", sa.Integer(), nullable=False, server_default="30"))
        batch.add_column(sa.Column("due_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True))
        batch.create_foreign_key(
            "fk_verification_cases_assigned_to_user_id",
            "platform_users",
            ["assigned_to_user_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index("ix_verification_cases_applicant_email", ["applicant_email"])
        batch.create_index("ix_verification_cases_priority", ["priority"])
        batch.create_index("ix_verification_cases_assigned_to_user_id", ["assigned_to_user_id"])
        batch.create_index("ix_verification_cases_intake_channel", ["intake_channel"])
        batch.create_index("ix_verification_cases_due_at", ["due_at"])
        batch.create_index("ix_verification_cases_expires_at", ["expires_at"])

    op.create_table(
        "verification_documents",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("organization_id", sa.String(length=64), nullable=False),
        sa.Column("verification_case_id", sa.String(length=64), nullable=False),
        sa.Column("uploaded_by_user_id", sa.String(length=64), nullable=True),
        sa.Column("document_type", sa.String(length=64), nullable=False),
        sa.Column("original_name", sa.String(length=512), nullable=False),
        sa.Column("storage_key", sa.String(length=1024), nullable=False),
        sa.Column("content_type", sa.String(length=255), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("scan_status", sa.String(length=32), nullable=False),
        sa.Column("extraction_status", sa.String(length=32), nullable=False),
        sa.Column("extracted_fields_json", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["platform_users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["verification_case_id"], ["verification_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_key"),
    )
    for column in ("organization_id", "verification_case_id", "uploaded_by_user_id", "document_type", "sha256", "status", "scan_status", "extraction_status", "expires_at", "created_at"):
        op.create_index(f"ix_verification_documents_{column}", "verification_documents", [column], unique=False)

    op.create_table(
        "verification_assignments",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("organization_id", sa.String(length=64), nullable=False),
        sa.Column("verification_case_id", sa.String(length=64), nullable=False),
        sa.Column("assigned_to_user_id", sa.String(length=64), nullable=True),
        sa.Column("assigned_by_user_id", sa.String(length=64), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["assigned_by_user_id"], ["platform_users.id"]),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["platform_users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["verification_case_id"], ["verification_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    for column in ("organization_id", "verification_case_id", "assigned_to_user_id", "assigned_by_user_id", "created_at"):
        op.create_index(f"ix_verification_assignments_{column}", "verification_assignments", [column], unique=False)

    op.create_table(
        "verification_reconciliations",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("organization_id", sa.String(length=64), nullable=False),
        sa.Column("verification_case_id", sa.String(length=64), nullable=False),
        sa.Column("field_name", sa.String(length=128), nullable=False),
        sa.Column("canonical_value", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("sources_json", sa.Text(), nullable=False),
        sa.Column("resolution_note", sa.Text(), nullable=False),
        sa.Column("resolved_by_user_id", sa.String(length=64), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resolved_by_user_id"], ["platform_users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["verification_case_id"], ["verification_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("verification_case_id", "field_name", name="uq_verification_reconciliation_field"),
    )
    for column in ("organization_id", "verification_case_id", "field_name", "status", "resolved_by_user_id", "created_at"):
        op.create_index(f"ix_verification_reconciliations_{column}", "verification_reconciliations", [column], unique=False)

    op.create_table(
        "secure_intake_links",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("organization_id", sa.String(length=64), nullable=False),
        sa.Column("created_by_user_id", sa.String(length=64), nullable=False),
        sa.Column("verification_case_id", sa.String(length=64), nullable=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("token_prefix", sa.String(length=16), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=False),
        sa.Column("recipient_name", sa.String(length=255), nullable=False),
        sa.Column("recipient_email", sa.String(length=320), nullable=False),
        sa.Column("recipient_phone_hint", sa.String(length=64), nullable=False),
        sa.Column("applicant_name", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("max_uploads", sa.Integer(), nullable=False),
        sa.Column("upload_count", sa.Integer(), nullable=False),
        sa.Column("retention_days", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["platform_users.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["verification_case_id"], ["verification_cases.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    for column in ("organization_id", "created_by_user_id", "verification_case_id", "token_hash", "token_prefix", "channel", "expires_at", "revoked_at", "created_at"):
        op.create_index(f"ix_secure_intake_links_{column}", "secure_intake_links", [column], unique=column == "token_hash")

    with op.batch_alter_table("platform_audit_events") as batch:
        batch.add_column(sa.Column("verification_case_id", sa.String(length=64), nullable=True))
        batch.create_foreign_key(
            "fk_platform_audit_events_verification_case_id",
            "verification_cases",
            ["verification_case_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index("ix_platform_audit_events_verification_case_id", ["verification_case_id"])


def downgrade() -> None:
    with op.batch_alter_table("platform_audit_events") as batch:
        batch.drop_index("ix_platform_audit_events_verification_case_id")
        batch.drop_constraint("fk_platform_audit_events_verification_case_id", type_="foreignkey")
        batch.drop_column("verification_case_id")
    op.drop_table("secure_intake_links")
    op.drop_table("verification_reconciliations")
    op.drop_table("verification_assignments")
    op.drop_table("verification_documents")
    with op.batch_alter_table("verification_cases") as batch:
        for index in ("ix_verification_cases_expires_at", "ix_verification_cases_due_at", "ix_verification_cases_intake_channel", "ix_verification_cases_assigned_to_user_id", "ix_verification_cases_priority", "ix_verification_cases_applicant_email"):
            batch.drop_index(index)
        batch.drop_constraint("fk_verification_cases_assigned_to_user_id", type_="foreignkey")
        for column in ("closed_at", "expires_at", "due_at", "retention_days", "intake_channel", "assigned_to_user_id", "priority", "applicant_email"):
            batch.drop_column(column)
