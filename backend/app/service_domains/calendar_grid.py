"""Complete calendar occupancy; at most 42 days × 3 navigation previews."""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from sqlalchemy import case, func, literal, select, union_all

from ..models import LifecycleItem, WorkflowTask


def calendar_grid(service, organization_id, user, month: date, grid_start: date, zone: str):
    service.workspace.membership(organization_id, user)
    try:
        tz = ZoneInfo(zone)
        end_month = (month.replace(day=28) + timedelta(days=4)).replace(day=1)
        days = [grid_start + timedelta(days=i) for i in range(43)]
        bounds = [datetime.combine(day, time.min, tzinfo=tz).astimezone(timezone.utc) for day in days]
    except (ValueError, OverflowError, ZoneInfoNotFoundError):
        raise HTTPException(422, "Invalid calendar date or timezone.") from None
    if month.day != 1 or grid_start > month or month - grid_start > timedelta(days=6) or days[-1] < end_month:
        raise HTTPException(422, "Choose the visible 42-day grid containing the selected month.")

    def records(model, kind, status):
        day = case(*[(model.due_at < bounds[i + 1], i) for i in range(42)])
        return select(model.id.label("id"), model.title.label("title"), model.contract_id.label("contract_id"),
            model.due_at.label("due_at"), day.label("day"), literal(kind).label("kind"),
            (model.priority if kind == "task" else model.kind).label("category"),
            model.status.label("status"),
            (literal(False) if kind == "task" else model.escalated_at.is_not(None)).label("escalated"),
        ).where(model.organization_id == organization_id, model.status.in_(status), model.due_at >= bounds[0], model.due_at < bounds[-1])

    records = union_all(records(WorkflowTask, "task", ["open", "in_progress", "done"]),
                        records(LifecycleItem, "lifecycle", ["active"])).subquery()
    ranked = select(*records.c,
        func.count().over(partition_by=records.c.day).label("total"),
        func.row_number().over(partition_by=records.c.day, order_by=(records.c.due_at, records.c.kind, records.c.id)).label("position"),
    ).subquery()
    # Window counts and previews share a single SQL statement/snapshot. Dense
    # days never transfer all rows; counts do not depend on agenda pagination.
    rows = service.session.execute(select(ranked).where(ranked.c.position <= 3).order_by(ranked.c.day, ranked.c.position)).mappings()
    result = [{"date": day.isoformat(), "total": 0, "items": []} for day in days[:-1]]
    for row in rows:
        item = {key: row[key] for key in ["id", "title", "contract_id", "due_at", "kind", "category", "status", "escalated"]}
        result[row["day"]]["total"] = row["total"]
        result[row["day"]]["items"].append(item)
    return {"days": result, "month_total": sum(day["total"] for day in result if month.isoformat() <= day["date"] < end_month.isoformat()),
            "grid_total": sum(day["total"] for day in result), "timezone": zone}
