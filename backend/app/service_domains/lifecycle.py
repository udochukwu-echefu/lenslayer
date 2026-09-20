from __future__ import annotations

from .base import (
    Any, HTTPException, LifecycleItem, LifecycleItemResponse, User, aware, calendar,
    datetime, select, timedelta, timezone, utcnow,
)


class LifecycleServiceMixin:
    def list_lifecycle_items(
        self,
        organization_id: str,
        user: User,
        contract_id: str | None = None,
        status: str | None = None,
    ) -> list[LifecycleItem]:
        self.workspace.membership(organization_id, user)
        query = select(LifecycleItem).where(LifecycleItem.organization_id == organization_id)
        if contract_id:
            query = query.where(LifecycleItem.contract_id == contract_id)
        if status:
            query = query.where(LifecycleItem.status == status)
        return list(self.session.scalars(query.order_by(LifecycleItem.due_at.asc())).all())

    def create_lifecycle_item(
        self,
        organization_id: str,
        contract_id: str,
        user: User,
        payload: dict[str, Any],
    ) -> LifecycleItem:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin", "reviewer"},
            "Viewers cannot create lifecycle items.",
        )
        self.contracts.get_contract(organization_id, contract_id, user)
        owner = self.tasks._task_assignee(organization_id, payload.get("owner_user_id"))
        item = LifecycleItem(
            organization_id=organization_id,
            contract_id=contract_id,
            created_by_user_id=user.id,
            owner_user_id=owner.id if owner else None,
            kind=payload["kind"],
            title=payload["title"].strip(),
            description=payload.get("description", "").strip(),
            amount=payload.get("amount", "").strip(),
            due_at=payload["due_at"],
            reminder_days=payload.get("reminder_days", 7),
            recurrence=payload.get("recurrence", "none"),
        )
        self.session.add(item)
        self.session.flush()
        self._audit(
            organization_id,
            user.id,
            "lifecycle.created",
            contract_id,
            {"lifecycle_id": item.id, "kind": item.kind, "due_at": item.due_at, "recurrence": item.recurrence},
        )
        self.session.commit()
        self.session.refresh(item)
        return item

    def update_lifecycle_item(
        self,
        organization_id: str,
        item_id: str,
        user: User,
        changes: dict[str, Any],
    ) -> LifecycleItem:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin", "reviewer"},
            "Viewers cannot change lifecycle items.",
        )
        item = self.session.scalar(
            select(LifecycleItem).where(
                LifecycleItem.id == item_id,
                LifecycleItem.organization_id == organization_id,
            ).with_for_update()
        )
        if item is None:
            raise HTTPException(status_code=404, detail="Lifecycle item not found.")
        if changes.get("due_at") is not None and aware(changes["due_at"]) != aware(item.due_at):
            # A rescheduled deadline needs its own reminders and escalation.
            item.last_notified_at = None
            item.escalated_at = None
        if "owner_user_id" in changes:
            owner = self.tasks._task_assignee(organization_id, changes["owner_user_id"])
            item.owner_user_id = owner.id if owner else None
        for field in ("title", "description", "amount", "due_at", "reminder_days", "recurrence"):
            if field in changes and changes[field] is not None:
                value = changes[field]
                if isinstance(value, str) and field in {"title", "description", "amount"}:
                    value = value.strip()
                setattr(item, field, value)
        if changes.get("status") and changes["status"] != item.status:
            item.status = changes["status"]
            item.completed_at = utcnow() if item.status == "completed" else None
            if item.status == "completed" and item.recurrence != "none":
                next_item = LifecycleItem(
                    organization_id=item.organization_id,
                    contract_id=item.contract_id,
                    created_by_user_id=user.id,
                    owner_user_id=item.owner_user_id,
                    kind=item.kind,
                    title=item.title,
                    description=item.description,
                    amount=item.amount,
                    due_at=self._next_occurrence(item.due_at, item.recurrence),
                    reminder_days=item.reminder_days,
                    recurrence=item.recurrence,
                )
                self.session.add(next_item)
        self._audit(
            organization_id,
            user.id,
            "lifecycle.updated",
            item.contract_id,
            {"lifecycle_id": item.id, "changed_fields": sorted(changes)},
        )
        self.session.commit()
        self.session.refresh(item)
        return item

    @staticmethod
    def lifecycle_response(item: LifecycleItem) -> LifecycleItemResponse:
        return LifecycleItemResponse(
            id=item.id,
            organization_id=item.organization_id,
            contract_id=item.contract_id,
            contract_title=item.contract.title,
            kind=item.kind,
            title=item.title,
            description=item.description,
            amount=item.amount,
            due_at=item.due_at,
            owner_user_id=item.owner_user_id,
            owner_name=item.owner.display_name if item.owner else None,
            reminder_days=item.reminder_days,
            recurrence=item.recurrence,
            status=item.status,
            last_notified_at=item.last_notified_at,
            escalated_at=item.escalated_at,
            completed_at=item.completed_at,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )

    @staticmethod
    def _next_occurrence(value: datetime, recurrence: str) -> datetime:
        if recurrence == "weekly":
            return value + timedelta(days=7)
        months = {"monthly": 1, "quarterly": 3, "yearly": 12}.get(recurrence, 0)
        month_index = value.month - 1 + months
        year = value.year + month_index // 12
        month = month_index % 12 + 1
        day = min(value.day, calendar.monthrange(year, month)[1])
        return value.replace(year=year, month=month, day=day)

    def calendar_ics(self, organization_id: str, user: User) -> str:
        self.workspace.membership(organization_id, user)
        events: list[tuple[str, str, datetime, str]] = []
        for task in self.tasks.list_tasks(organization_id, user):
            if task.due_at and task.status not in {"done", "cancelled"}:
                events.append((f"task-{task.id}", task.title, task.due_at, task.contract.title if task.contract else "LensLayer"))
        for item in self.list_lifecycle_items(organization_id, user, status="active"):
            events.append((f"lifecycle-{item.id}", item.title, item.due_at, f"{item.kind}: {item.contract.title}"))
        def escape(value: str) -> str:
            return value.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")
        lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LensLayer//Lifecycle Calendar//EN", "CALSCALE:GREGORIAN"]
        for uid, title, due_at, description in events:
            stamp = aware(due_at).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            lines.extend([
                "BEGIN:VEVENT",
                f"UID:{uid}@lenslayer",
                f"DTSTAMP:{utcnow().strftime('%Y%m%dT%H%M%SZ')}",
                f"DTSTART:{stamp}",
                f"SUMMARY:{escape(title)}",
                f"DESCRIPTION:{escape(description)}",
                "END:VEVENT",
            ])
        lines.append("END:VCALENDAR")
        return "\r\n".join(lines) + "\r\n"
