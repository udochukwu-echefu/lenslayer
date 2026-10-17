"""Bounded, authorized list/search/overview queries without loading source text.

Offset pages are live views, not immutable snapshots across requests. Filtering
precedes pagination and every order has a unique tie-breaker. Empty/out-of-range
pages retain the true count; consumers can restart after concurrent mutations.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from itertools import zip_longest
from urllib.parse import quote

from fastapi import HTTPException
from sqlalchemy import String, and_, case, cast, func, or_, select
from sqlalchemy.orm import joinedload

from ..models import Contract, LifecycleItem, ProcessingJob, User, WorkflowTask, utcnow
from ..schemas import ContractResponse, JobResponse
from ..workspace_query_schemas import (
    OverviewCounts, RecordPage, SearchItem, SearchResponse, WorkspaceOverview,
)
from .common import json_load


def search_terms(value: str) -> list[str]:
    terms = value.strip().split()
    if len(terms) > 8:
        raise HTTPException(422, "Use at most eight search terms.")
    return terms


def text_filter(terms, columns):
    # Bound parameters and autoescape make '%' and '_' literal user input.
    return and_(*(or_(*(column.icontains(term, autoescape=True) for column in columns)) for term in terms)) if terms else True


def statuses(value: str | None, allowed: set[str]):
    if not value:
        return None
    selected = set(value.split(","))
    if not selected or not selected <= allowed:
        raise HTTPException(422, "Unknown record status.")
    return sorted(selected)


def aware_bound(value: datetime | None) -> datetime | None:
    if value is not None and (value.tzinfo is None or value.utcoffset() is None):
        raise HTTPException(422, "Dates must include a timezone.")
    return value


class WorkspaceQueriesServiceMixin:
    @staticmethod
    def _ordered(query, model, sort, allowed, descending):
        if sort not in allowed:
            raise HTTPException(422, "Unknown sort field.")
        column = getattr(model, sort)
        order = column.desc() if descending else column.asc()
        # Null deadlines are consistently last in both directions.
        return query.order_by(order.nulls_last(), model.id.desc() if descending else model.id.asc())

    def _record_page(self, query, model, serializer, *, limit, offset, sort, allowed, descending):
        if not 1 <= limit <= 100 or not 0 <= offset <= 1_000_000:
            raise HTTPException(422, "Invalid page bounds.")
        # The window total and returned rows share one statement snapshot, even
        # under PostgreSQL READ COMMITTED during concurrent writes.
        page_query = query.add_columns(func.count().over().label("page_total"))
        page = self.session.execute(self._ordered(page_query, model, sort, allowed, descending).offset(offset).limit(limit)).all()
        rows = [row[0] for row in page]
        # An empty/out-of-range page has no window row. Count the current live
        # collection; never pretend it is empty merely because offset is stale.
        total = page[0][1] if page else self.session.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
        items = serializer(rows)
        return RecordPage(items=items, total=total, offset=offset, limit=limit)

    def _contract_query(self, organization_id, q="", status=None):
        query = select(Contract).where(Contract.organization_id == organization_id)
        selected = statuses(status, {"queued", "processing", "running", "ready", "reviewed", "failed"})
        if selected:
            query = query.where(Contract.status.in_(selected))
        return query.where(text_filter(search_terms(q), [Contract.title, Contract.source_name, Contract.counterparty, Contract.contract_type, Contract.status]))

    def _contract_items(self, rows):
        if not rows:
            return []
        # Do not load every historical job just to display the latest status.
        latest_ids = select(
            ProcessingJob.id.label("id"),
            func.row_number().over(partition_by=ProcessingJob.contract_id, order_by=(ProcessingJob.created_at.desc(), ProcessingJob.id.desc())).label("position"),
        ).where(ProcessingJob.contract_id.in_([row.id for row in rows])).subquery()
        jobs = self.session.scalars(select(ProcessingJob).join(latest_ids, latest_ids.c.id == ProcessingJob.id).where(latest_ids.c.position == 1)).all()
        latest = {job.contract_id: job for job in jobs}
        return [ContractResponse(
            id=row.id, organization_id=row.organization_id, title=row.title,
            source_name=row.source_name, counterparty=row.counterparty,
            contract_type=row.contract_type, status=row.status,
            review_context=json_load(row.review_context_json, {}),
            retain_document=row.retain_document, retain_source_text=row.retain_source_text,
            retention_days=row.retention_days, expires_at=row.expires_at,
            created_at=row.created_at, updated_at=row.updated_at,
            latest_job=JobResponse.model_validate(latest[row.id]) if row.id in latest else None,
        ) for row in rows]

    def query_contracts(self, organization_id, user, *, q="", status=None, sort="updated_at", descending=True, limit=25, offset=0):
        self.workspace.membership(organization_id, user)
        return self._record_page(self._contract_query(organization_id, q, status), Contract, self._contract_items,
                                 limit=limit, offset=offset, sort=sort, descending=descending,
                                 allowed={"updated_at", "created_at", "title", "counterparty", "contract_type", "status"})

    def _task_query(self, organization_id, *, q="", status=None, assigned_to_user_id=None, contract_id=None, due_before=None, due_after=None, category=None):
        query = select(WorkflowTask).outerjoin(Contract, Contract.id == WorkflowTask.contract_id).outerjoin(User, User.id == WorkflowTask.assigned_to_user_id).where(WorkflowTask.organization_id == organization_id)
        selected = statuses(status, {"open", "in_progress", "done", "cancelled"})
        if selected:
            query = query.where(WorkflowTask.status.in_(selected))
        for column, value in [(WorkflowTask.assigned_to_user_id, assigned_to_user_id), (WorkflowTask.contract_id, contract_id), (WorkflowTask.category, category)]:
            if value is not None:
                query = query.where(column == value)
        if aware_bound(due_before):
            query = query.where(WorkflowTask.due_at <= due_before)
        if aware_bound(due_after):
            query = query.where(WorkflowTask.due_at >= due_after)
        return query.where(text_filter(search_terms(q), [WorkflowTask.title, Contract.title, Contract.counterparty, User.display_name, cast(WorkflowTask.due_at, String)]))

    def _task_items(self, rows):
        return [self.task_response(row) for row in rows]

    def query_tasks(self, organization_id, user, *, limit=25, offset=0, sort="due_at", descending=False, **filters):
        self.workspace.membership(organization_id, user)
        query = self._task_query(organization_id, **filters).options(joinedload(WorkflowTask.contract), joinedload(WorkflowTask.assigned_to_user))
        return self._record_page(query, WorkflowTask, self._task_items, limit=limit, offset=offset, sort=sort, descending=descending,
                                 allowed={"due_at", "created_at", "title", "status", "priority"})

    def query_lifecycle(self, organization_id, user, *, q="", status=None, contract_id=None, due_before=None, due_after=None, limit=25, offset=0, sort="due_at", descending=False):
        self.workspace.membership(organization_id, user)
        query = select(LifecycleItem).join(Contract, Contract.id == LifecycleItem.contract_id).where(LifecycleItem.organization_id == organization_id)
        selected = statuses(status, {"active", "completed", "cancelled"})
        if selected:
            query = query.where(LifecycleItem.status.in_(selected))
        if contract_id is not None:
            query = query.where(LifecycleItem.contract_id == contract_id)
        if aware_bound(due_before):
            query = query.where(LifecycleItem.due_at <= due_before)
        if aware_bound(due_after):
            query = query.where(LifecycleItem.due_at >= due_after)
        query = query.where(text_filter(search_terms(q), [LifecycleItem.title, Contract.title, Contract.counterparty, cast(LifecycleItem.due_at, String)])).options(joinedload(LifecycleItem.contract), joinedload(LifecycleItem.owner))
        return self._record_page(query, LifecycleItem, lambda rows: [self.lifecycle_response(row) for row in rows],
                                 limit=limit, offset=offset, sort=sort, descending=descending,
                                 allowed={"due_at", "created_at", "title", "status", "kind"})

    def workspace_search(self, organization_id, user, q, limit=10):
        self.workspace.membership(organization_id, user)
        terms = search_terms(q)
        if len(q.strip()) < 2 or len(q) > 200 or not 1 <= limit <= 20:
            raise HTTPException(422, "Use 2–200 characters and at most 20 results.")
        contracts = self.session.execute(select(Contract.id, Contract.title, Contract.source_name, Contract.counterparty, Contract.status).where(
            Contract.organization_id == organization_id,
            text_filter(terms, [Contract.title, Contract.source_name, Contract.counterparty, Contract.contract_type, Contract.status]),
        ).order_by(Contract.updated_at.desc(), Contract.id.desc()).limit(limit)).all()
        tasks = self.session.execute(select(WorkflowTask.id, WorkflowTask.title, WorkflowTask.due_at, Contract.title.label("contract_title"), User.display_name).select_from(WorkflowTask)
            .outerjoin(Contract, Contract.id == WorkflowTask.contract_id).outerjoin(User, User.id == WorkflowTask.assigned_to_user_id)
            .where(WorkflowTask.organization_id == organization_id, text_filter(terms, [WorkflowTask.title, Contract.title, Contract.counterparty, User.display_name, cast(WorkflowTask.due_at, String)]))
            .order_by(WorkflowTask.created_at.desc(), WorkflowTask.id.desc()).limit(limit)).all()
        contract_items = [SearchItem(id=row.id, kind="contract", title=row.title or row.source_name, meta=f"{row.counterparty} · {row.status}", href=f"/contracts/{quote(row.id, safe='')}") for row in contracts]
        task_items = [SearchItem(id=row.id, kind="task", title=row.title, meta=" · ".join(value for value in [row.contract_title or "Workspace action", row.display_name, row.due_at.date().isoformat() if row.due_at else None, "task"] if value), href="/tasks") for row in tasks]
        # Interleave kinds so matches in one collection cannot starve the other.
        items = [item for pair in zip_longest(contract_items, task_items) for item in pair if item is not None][:limit]
        return SearchResponse(items=items, query=q.strip())

    def workspace_overview(self, organization_id, user, *, day_start=None, week_end=None):
        self.workspace.membership(organization_id, user)
        now = utcnow()
        start = aware_bound(day_start) or now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = aware_bound(week_end) or start + timedelta(days=8)
        if not start < end or end - start > timedelta(days=32):
            raise HTTPException(422, "Choose an overview date range of at most 32 days.")
        def count_if(condition):
            return func.coalesce(func.sum(case((condition, 1), else_=0)), 0)
        contract_counts = self.session.execute(select(
            func.count(Contract.id), count_if(Contract.status == "ready"), count_if(Contract.status == "failed"),
            count_if(Contract.status.in_(["queued", "processing", "running"])),
        ).where(Contract.organization_id == organization_id)).one()
        active = WorkflowTask.status.in_(["open", "in_progress"])
        task_counts = self.session.execute(select(
            count_if(active), count_if(WorkflowTask.status == "done"),
            count_if(and_(active, WorkflowTask.due_at < start)),
            count_if(and_(active, WorkflowTask.due_at >= start)),
            count_if(and_(active, WorkflowTask.due_at >= start, WorkflowTask.due_at < end)),
        ).where(WorkflowTask.organization_id == organization_id)).one()
        life = select(LifecycleItem).where(LifecycleItem.organization_id == organization_id, LifecycleItem.status == "active", LifecycleItem.kind.in_(["notice", "renewal"]), LifecycleItem.due_at >= now)
        life_count = self.session.scalar(select(func.count()).select_from(life.subquery())) or 0
        # Each preview is a bounded database query. No review/source body is read.
        recent = self._contract_items(list(self.session.scalars(self._contract_query(organization_id).order_by(Contract.updated_at.desc(), Contract.id.desc()).limit(5)).all()))
        attention = self._contract_items(list(self.session.scalars(self._contract_query(organization_id, status="ready,failed").order_by(Contract.updated_at.desc(), Contract.id.desc()).limit(5)).all()))
        task_base = select(WorkflowTask).where(WorkflowTask.organization_id == organization_id, active).options(joinedload(WorkflowTask.contract), joinedload(WorkflowTask.assigned_to_user))
        my_tasks = self.session.scalars(task_base.where(WorkflowTask.assigned_to_user_id == user.id).order_by(WorkflowTask.due_at.asc().nulls_last(), WorkflowTask.id.asc()).limit(5)).all()
        upcoming = self.session.scalars(task_base.where(WorkflowTask.due_at >= start).order_by(WorkflowTask.due_at.asc(), WorkflowTask.id.asc()).limit(4)).all()
        upcoming_life = self.session.scalars(life.options(joinedload(LifecycleItem.contract), joinedload(LifecycleItem.owner)).order_by(LifecycleItem.due_at.asc(), LifecycleItem.id.asc()).limit(4)).all()
        return WorkspaceOverview(
            counts=OverviewCounts(contracts=contract_counts[0], ready=contract_counts[1], failed=contract_counts[2], processing=contract_counts[3], attention=contract_counts[1] + contract_counts[2],
                                  active_tasks=task_counts[0], completed_tasks=task_counts[1], overdue_tasks=task_counts[2], upcoming_tasks=task_counts[3], due_soon_tasks=task_counts[4], upcoming_notice_deadlines=life_count),
            recent_contracts=recent, attention_contracts=attention, my_tasks=self._task_items(my_tasks), upcoming_tasks=self._task_items(upcoming),
            upcoming_lifecycle=[self.lifecycle_response(row) for row in upcoming_life], as_of=now,
        )
