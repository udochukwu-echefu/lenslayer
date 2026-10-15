"""webhook signing secrets and member email preferences

Revision ID: 6b1d3e8f2c57
Revises: 4d2c8f1a9e77
"""

from collections.abc import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "6b1d3e8f2c57"
down_revision: Union[str, Sequence[str], None] = "4d2c8f1a9e77"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("webhook_subscriptions") as batch:
        batch.add_column(sa.Column("signing_secret", sa.String(length=128), nullable=True))
    with op.batch_alter_table("organization_memberships") as batch:
        batch.add_column(
            sa.Column("email_notifications", sa.Boolean(), nullable=False, server_default=sa.true())
        )


def downgrade() -> None:
    with op.batch_alter_table("organization_memberships") as batch:
        batch.drop_column("email_notifications")
    with op.batch_alter_table("webhook_subscriptions") as batch:
        batch.drop_column("signing_secret")
