"""Additive bounded workspace reads; legacy array endpoints are unchanged."""
from __future__ import annotations

from datetime import datetime
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel

from .schemas import ContractResponse, LifecycleItemResponse, TaskResponse

T = TypeVar("T")


class RecordPage(BaseModel, Generic[T]):
    items: list[T]
    total: int
    offset: int
    limit: int


class SearchItem(BaseModel):
    id: str
    kind: Literal["contract", "task"]
    title: str
    meta: str
    href: str


class SearchResponse(BaseModel):
    items: list[SearchItem]
    query: str


class OverviewCounts(BaseModel):
    contracts: int
    ready: int
    failed: int
    processing: int
    attention: int
    active_tasks: int
    completed_tasks: int
    overdue_tasks: int
    upcoming_tasks: int
    upcoming_notice_deadlines: int
    due_soon_tasks: int


class WorkspaceOverview(BaseModel):
    counts: OverviewCounts
    recent_contracts: list[ContractResponse]
    attention_contracts: list[ContractResponse]
    my_tasks: list[TaskResponse]
    upcoming_tasks: list[TaskResponse]
    upcoming_lifecycle: list[LifecycleItemResponse]
    as_of: datetime
