"""Align historical indexes without weakening existing unique constraints.

The three unique columns already have table-level UNIQUE constraints. Leave
those intact throughout upgrade/downgrade and replace only their nonunique
indexes. No rows or constraints are removed, including on SQLite.
"""
from alembic import op

revision = "8f1a3c5e7b90"
down_revision = "6e8a2b4d9c10"
branch_labels = None
depends_on = None

MISSING = (("approval_requests", "requested_by_user_id"), ("approval_requests", "resolved_by_user_id"),
           ("contract_lifecycle_items", "created_by_user_id"))
UNIQUE = (("external_shares", "token_hash"), ("public_api_keys", "key_hash"),
          ("organization_settings", "organization_id"))


def upgrade():
    for table, column in MISSING:
        op.create_index(f"ix_{table}_{column}", table, [column])
    for table, column in UNIQUE:
        op.drop_index(f"ix_{table}_{column}", table_name=table)
        op.create_index(f"ix_{table}_{column}", table, [column], unique=True)


def downgrade():
    for table, column in reversed(UNIQUE):
        op.drop_index(f"ix_{table}_{column}", table_name=table)
        op.create_index(f"ix_{table}_{column}", table, [column], unique=False)
    for table, column in reversed(MISSING):
        op.drop_index(f"ix_{table}_{column}", table_name=table)
