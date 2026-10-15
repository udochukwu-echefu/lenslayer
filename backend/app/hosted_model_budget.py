"""Single global lifetime paid-call gate, not an ongoing production cost budget.

Admission burns a full reservation, even if the task never dispatches. No refunds,
deletion, expiry, reset or provider fallback. Counter/ledger have NO cascading FK.
"""
from sqlalchemy import select, update, func
from fastapi import HTTPException

from .hosted_agent_models import HostedModelLifetimeBudget, HostedModelReservation

BUDGET_ID = "global-product-model-v1"
RESERVED_USD = "0.319488"
INPUT_BOUND = 1048576
OUTPUT_BOUND = 4096


def budget_provider(settings):
    # Only DeepSeek's conservative current price/context has been established.
    return settings.hosted_model_provider == "deepseek"


def gate_configured(settings):
    return settings.hosted_model_enabled and settings.hosted_model_lifetime_call_limit > 0 and budget_provider(settings)


def admission_available(session, settings):
    if not gate_configured(settings):
        return False
    used = session.scalar(select(HostedModelLifetimeBudget.reserved_calls).where(HostedModelLifetimeBudget.id == BUDGET_ID)) or 0
    rows = session.scalar(select(func.count()).select_from(HostedModelReservation))
    return used >= rows and 0 <= used < settings.hosted_model_lifetime_call_limit


def reserve_admission(session, settings, task):
    if not gate_configured(settings):
        raise HTTPException(503, "Paid product model lifetime allowance is unavailable.")
    dialect = session.bind.dialect.name
    if dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    elif dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        raise HTTPException(503, "Paid product model budget requires a supported durable database.")
    session.execute(insert(HostedModelLifetimeBudget).values(id=BUDGET_ID, reserved_calls=0).on_conflict_do_nothing(index_elements=["id"]))
    used = session.scalar(select(HostedModelLifetimeBudget.reserved_calls).where(HostedModelLifetimeBudget.id == BUDGET_ID).with_for_update())
    rows = session.scalar(select(func.count()).select_from(HostedModelReservation))
    if used is None or used < rows or used < 0:
        raise HTTPException(503, "Paid product model lifetime ledger is inconsistent.")
    changed = session.execute(update(HostedModelLifetimeBudget).where(
        HostedModelLifetimeBudget.id == BUDGET_ID,
        HostedModelLifetimeBudget.reserved_calls < settings.hosted_model_lifetime_call_limit)
        .values(reserved_calls=HostedModelLifetimeBudget.reserved_calls + 1).execution_options(synchronize_session=False)).rowcount
    if changed != 1:
        raise HTTPException(503, "Paid product model lifetime allowance is exhausted.")
    session.add(HostedModelReservation(task_id=task.id, organization_id=task.organization_id,
        request_sha256=task.request_sha256, selection_sha256=task.model_selection_sha256,
        provider=task.model_provider, model_id=task.model_id, reasoning_effort=task.model_reasoning_effort,
        reserved_usd=RESERVED_USD, input_token_bound=INPUT_BOUND, output_token_bound=OUTPUT_BOUND))
    session.flush()  # commits together with immutable creation, never after HTTP


def reservation_valid(session, settings, task):
    if not gate_configured(settings):
        return False
    row = session.get(HostedModelReservation, task.id)
    used = session.scalar(select(HostedModelLifetimeBudget.reserved_calls).where(HostedModelLifetimeBudget.id == BUDGET_ID))
    return bool(row and used and used <= settings.hosted_model_lifetime_call_limit
        and row.organization_id == task.organization_id and row.request_sha256 == task.request_sha256
        and row.selection_sha256 == task.model_selection_sha256
        and (row.provider, row.model_id, row.reasoning_effort) == (task.model_provider, task.model_id, "high")
        and row.reserved_usd == RESERVED_USD and row.input_token_bound == INPUT_BOUND and row.output_token_bound == OUTPUT_BOUND)
