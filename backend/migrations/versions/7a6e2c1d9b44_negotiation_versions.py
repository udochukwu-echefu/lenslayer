"""negotiation versions

Revision ID: 7a6e2c1d9b44
Revises: f3b8c2d74a10
"""

from collections.abc import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "7a6e2c1d9b44"
down_revision: Union[str, Sequence[str], None] = "f3b8c2d74a10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _contract_scope_columns() -> list[sa.Column]:
    return [
        sa.Column("organization_id", sa.String(length=64), nullable=False),
        sa.Column("contract_id", sa.String(length=64), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "contract_versions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        *_contract_scope_columns(),
        sa.Column("document_asset_id", sa.String(length=64), nullable=True),
        sa.Column("uploaded_by_user_id", sa.String(length=64), nullable=True),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("source_name", sa.String(length=512), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("comparison_json", sa.Text(), nullable=False),
        sa.Column("extracted_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contract_id"], ["platform_contracts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["document_asset_id"], ["document_assets.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["platform_users.id"]),
        sa.UniqueConstraint("contract_id", "version_number", name="uq_contract_version_number"),
    )
    op.create_table(
        "negotiation_items",
        sa.Column("id", sa.String(length=64), primary_key=True),
        *_contract_scope_columns(),
        sa.Column("created_by_user_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("priority", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("our_position", sa.Text(), nullable=False),
        sa.Column("counterparty_position", sa.Text(), nullable=False),
        sa.Column("source_reference_json", sa.Text(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contract_id"], ["platform_contracts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["platform_users.id"]),
    )
    op.create_table(
        "counterparty_responses",
        sa.Column("id", sa.String(length=64), primary_key=True),
        *_contract_scope_columns(),
        sa.Column("contract_version_id", sa.String(length=64), nullable=True),
        sa.Column("recorded_by_user_id", sa.String(length=64), nullable=False),
        sa.Column("responder_name", sa.String(length=255), nullable=False),
        sa.Column("channel", sa.String(length=64), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("related_item_ids_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contract_id"], ["platform_contracts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contract_version_id"], ["contract_versions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["recorded_by_user_id"], ["platform_users.id"]),
    )
    for table, columns in {
        "contract_versions": [
            "organization_id",
            "contract_id",
            "document_asset_id",
            "uploaded_by_user_id",
            "version_number",
            "sha256",
            "created_at",
        ],
        "negotiation_items": ["organization_id", "contract_id", "created_by_user_id", "category", "priority", "status", "created_at"],
        "counterparty_responses": ["organization_id", "contract_id", "contract_version_id", "recorded_by_user_id", "channel", "created_at"],
    }.items():
        for column in columns:
            op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade() -> None:
    for table in ("counterparty_responses", "negotiation_items", "contract_versions"):
        op.drop_table(table)
