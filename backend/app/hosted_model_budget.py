"""Global lifetime pilot admission: at most three fixed reservations below USD 1.

Admission burns a full reservation, even if the task never dispatches. No refunds,
deletion, expiry, reset or provider fallback. Counter/ledger have NO cascading FK.
"""
from decimal import Decimal
import hashlib
import json
import re

from sqlalchemy import select, update
from fastapi import HTTPException

from .hosted_agent_models import HostedModelLifetimeBudget, HostedModelReservation
from .hosted_model_providers import select_provider

BUDGET_ID = "global-product-model-v1"
RESERVED_USD = "0.319488"
INPUT_BOUND = 1048576
OUTPUT_BOUND = 4096


def budget_provider(settings):
    # Only DeepSeek's conservative current price/context has been established.
    return settings.hosted_model_provider == "deepseek"


def gate_configured(settings):
    # Also fail closed on invalid in-process mutations, not just Settings parsing.
    try:
        usd = settings.hosted_model_lifetime_usd_limit
        calls = settings.hosted_model_lifetime_call_limit
        return (settings.hosted_model_enabled and budget_provider(settings)
            and type(calls) is int and 0 < calls <= 3
            and isinstance(usd, Decimal) and usd.is_finite() and 0 < usd <= Decimal("1.00"))
    except AttributeError:
        return False


def _known_reservation(row, settings):
    provider = select_provider(settings.hosted_model_provider)
    # Historical prices/bounds are immutable. Unknown history is never repriced,
    # ignored, refunded or converted into free capacity, even after task deletion.
    if (row.reserved_usd != RESERVED_USD
            or (row.provider, row.model_id, row.reasoning_effort) != (provider.name, provider.model, "high")
            or row.input_token_bound != INPUT_BOUND or row.output_token_bound != OUTPUT_BOUND
            or not row.task_id or not row.organization_id
            or not isinstance(row.request_sha256, str) or not re.fullmatch(r"[0-9a-f]{64}", row.request_sha256)):
        return False
    selection = json.dumps({"request_sha256": row.request_sha256, "provider": row.provider,
        "model_id": row.model_id, "effort": row.reasoning_effort}, sort_keys=True, separators=(",", ":"))
    return row.selection_sha256 == hashlib.sha256(selection.encode()).hexdigest()


def _ledger(session, settings):
    used = session.scalar(select(HostedModelLifetimeBudget.reserved_calls).where(HostedModelLifetimeBudget.id == BUDGET_ID))
    rows = session.scalars(select(HostedModelReservation).limit(4)).all()
    if used is None:
        return (0, Decimal("0")) if not rows else None  # pristine database only
    if type(used) is not int or not 0 <= used <= 3 or used != len(rows):
        return None
    if any(not _known_reservation(row, settings) for row in rows):
        return None
    total = sum((Decimal(row.reserved_usd) for row in rows), Decimal("0"))
    if used > settings.hosted_model_lifetime_call_limit or total > settings.hosted_model_lifetime_usd_limit:
        return None
    return used, total


def admission_available(session, settings):
    if not gate_configured(settings):
        return False
    ledger = _ledger(session, settings)
    return bool(ledger is not None and ledger[0] < settings.hosted_model_lifetime_call_limit
        and ledger[1] + Decimal(RESERVED_USD) <= settings.hosted_model_lifetime_usd_limit)


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
    session.scalar(select(HostedModelLifetimeBudget.reserved_calls).where(HostedModelLifetimeBudget.id == BUDGET_ID).with_for_update())
    ledger = _ledger(session, settings)
    if ledger is None:
        raise HTTPException(503, "Paid product model lifetime ledger is inconsistent.")
    used, total = ledger
    if total + Decimal(RESERVED_USD) > settings.hosted_model_lifetime_usd_limit:
        raise HTTPException(503, "Paid product model lifetime allowance is exhausted.")
    # All historical amounts have been verified identical above. Integer capacity
    # is the exact Decimal monetary predicate, without SQLite floating-point sums.
    usd_capacity = int(settings.hosted_model_lifetime_usd_limit // Decimal(RESERVED_USD))
    changed = session.execute(update(HostedModelLifetimeBudget).where(
         HostedModelLifetimeBudget.id == BUDGET_ID,
        HostedModelLifetimeBudget.reserved_calls == used,
        HostedModelLifetimeBudget.reserved_calls < settings.hosted_model_lifetime_call_limit,
        HostedModelLifetimeBudget.reserved_calls < usd_capacity)
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
    if _ledger(session, settings) is None:
        return False
    row = session.get(HostedModelReservation, task.id)
    used = session.scalar(select(HostedModelLifetimeBudget.reserved_calls).where(HostedModelLifetimeBudget.id == BUDGET_ID))
    return bool(row and used and used <= settings.hosted_model_lifetime_call_limit
        and row.organization_id == task.organization_id and row.request_sha256 == task.request_sha256
        and row.selection_sha256 == task.model_selection_sha256
        and (row.provider, row.model_id, row.reasoning_effort) == (task.model_provider, task.model_id, "high")
        and row.reserved_usd == RESERVED_USD and row.input_token_bound == INPUT_BOUND and row.output_token_bound == OUTPUT_BOUND)
