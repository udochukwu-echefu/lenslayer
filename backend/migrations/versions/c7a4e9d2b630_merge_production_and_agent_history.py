"""Converge the recovered production and already-applied staging histories.

Neither parent is rewritten. Alembic applies only the missing sibling branch,
then records this merge. No data, columns, defaults or credentials are rewritten.
Downgrade is deliberately blocked before either historical branch can lose data.
"""
import re

from alembic import op
import sqlalchemy as sa

revision = "c7a4e9d2b630"
down_revision = ("bf84e2c19a67", "6b1d3e8f2c57")
branch_labels = None
depends_on = None


def historical_true_default(value, dialect):
    """Recognize only reflected literal true, parentheses and PG boolean casts.

    Never evaluate SQL, guess arbitrary expression semantics or repair drift.
    Quoted text is true only after an explicit PostgreSQL boolean cast.
    """
    if dialect not in {"sqlite", "postgresql"} or not isinstance(value, str) or len(value) > 256:
        return False

    def literal(expression, depth=0):
        expression = expression.strip().lower()
        if depth > 16:
            return None
        if expression.startswith("(") and expression.endswith(")"):
            level = 0
            for position, char in enumerate(expression):
                level += (char == "(") - (char == ")")
                if level == 0:
                    if position == len(expression) - 1:
                        return literal(expression[1:-1], depth + 1)
                    break
        if dialect == "postgresql":
            cast = re.fullmatch(r"(.+)::\s*(?:pg_catalog\.)?(?:boolean|bool)", expression, re.DOTALL)
            if cast:
                return "boolean" if literal(cast[1], depth + 1) is not None else None
        if expression == "true":
            return "boolean"
        if expression == "1":
            return "integer"
        if expression in {"'true'", "'t'", "'1'"}:
            return "text"
        return None

    kind = literal(value)
    return kind == "boolean" or (dialect == "sqlite" and kind == "integer")


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    secret = {c["name"]: c for c in inspector.get_columns("webhook_subscriptions")}["signing_secret"]
    preference = {c["name"]: c for c in inspector.get_columns("organization_memberships")}["email_notifications"]
    if (not isinstance(secret["type"], sa.String) or secret["type"].length != 128
            or not secret["nullable"] or not isinstance(preference["type"], sa.Boolean)
            or preference["nullable"]):
        raise RuntimeError("Recovered production compatibility columns have unexpected shape; stop for review.")
    if not historical_true_default(preference.get("default"), bind.dialect.name):
        raise RuntimeError("Recovered production email default is missing or unrecognized; stop for review without repair.")


def downgrade() -> None:
    raise RuntimeError("Compatibility merge is forward-only: preserve signing secrets, opt-outs and agent ledgers. Use a reviewed forward fix.")
