"""Immutable product model selection and trusted Calendar browser sessions.

Follows the private-context and workflow-graph migration b14e6f8a9023.
Legacy model tasks/states are NOT guessed or granted a session/provider binding.
"""
from alembic import op
import sqlalchemy as sa

revision = "bf84e2c19a67"
down_revision = "b14e6f8a9023"
branch_labels = None
depends_on = None


def upgrade():
    tables = sa.inspect(op.get_bind()).get_table_names()
    if "hosted_model_lifetime_budget" not in tables:
        op.create_table("hosted_model_lifetime_budget", sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("reserved_calls", sa.Integer(), nullable=False))
    if "hosted_model_reservations" not in tables:
        op.create_table("hosted_model_reservations",
        sa.Column("task_id", sa.String(64), primary_key=True), sa.Column("organization_id", sa.String(64), nullable=False),
        sa.Column("request_sha256", sa.String(64), nullable=False), sa.Column("selection_sha256", sa.String(64), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False), sa.Column("model_id", sa.String(64), nullable=False),
        sa.Column("reasoning_effort", sa.String(16), nullable=False), sa.Column("reserved_usd", sa.String(32), nullable=False),
        sa.Column("input_token_bound", sa.Integer(), nullable=False), sa.Column("output_token_bound", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    for name, size in (("model_provider", 32), ("model_id", 64), ("model_reasoning_effort", 16), ("model_selection_sha256", 64)):
        op.add_column("hosted_agent_tasks", sa.Column(name, sa.String(size), nullable=True))
    op.add_column("calendar_credentials", sa.Column("session_fingerprint", sa.String(64), nullable=True))
    op.add_column("calendar_oauth_states", sa.Column("session_fingerprint", sa.String(64), nullable=True))
    op.add_column("calendar_oauth_states", sa.Column("binding_sha256", sa.String(64), nullable=True))
    op.create_table("calendar_session_proofs",
        sa.Column("nonce_sha256", sa.String(64), primary_key=True),
        sa.Column("organization_id", sa.String(64), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_calendar_session_proofs_organization_id", "calendar_session_proofs", ["organization_id"])
    op.create_index("ix_calendar_session_proofs_expires_at", "calendar_session_proofs", ["expires_at"])


def downgrade():
    # Spent authorization is permanent. Keep counter and reservations even when
    # rolling back model/session columns; downgrade MUST NOT replenish allowance.
    op.drop_table("calendar_session_proofs")
    op.drop_column("calendar_oauth_states", "binding_sha256")
    op.drop_column("calendar_oauth_states", "session_fingerprint")
    op.drop_column("calendar_credentials", "session_fingerprint")
    for name in ("model_selection_sha256", "model_reasoning_effort", "model_id", "model_provider"):
        op.drop_column("hosted_agent_tasks", name)
