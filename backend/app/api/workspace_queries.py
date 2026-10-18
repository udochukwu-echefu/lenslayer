"""Opt-in bounded read contract. Legacy array routes remain complete."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field

from ..schemas import ContractResponse, LifecycleItemResponse, TaskResponse
from ..workspace_query_schemas import RecordPage, SearchResponse, WorkspaceOverview
from .dependencies import ServiceDep, UserDep


def private_response(response: Response):
    response.headers["Cache-Control"] = "private, no-store"


router = APIRouter(prefix="/organizations/{organization_id}/query", tags=["workspace queries"], dependencies=[Depends(private_response)])


class PageOptions(BaseModel):
    limit: int = Field(default=25, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=1_000_000)
    q: str = Field(default="", max_length=200)
    status: str | None = Field(default=None, max_length=120)
    sort: str = Field(default="updated_at", max_length=40)
    descending: bool = True


class TaskOptions(PageOptions):
    sort: str = "due_at"
    descending: bool = False
    assigned_to_user_id: str | None = Field(default=None, max_length=64)
    contract_id: str | None = Field(default=None, max_length=64)
    due_before: datetime | None = None
    due_after: datetime | None = None
    due_before_exclusive: bool = False
    category: str | None = Field(default=None, max_length=64)


class LifecycleOptions(PageOptions):
    sort: str = "due_at"
    descending: bool = False
    contract_id: str | None = Field(default=None, max_length=64)
    due_before: datetime | None = None
    due_after: datetime | None = None
    due_before_exclusive: bool = False


@router.get("/contracts", response_model=RecordPage[ContractResponse])
def contracts(organization_id: str, service: ServiceDep, user: UserDep, options: Annotated[PageOptions, Query()]):
    return service.query_contracts(organization_id, user, **options.model_dump())


@router.get("/tasks", response_model=RecordPage[TaskResponse])
def tasks(organization_id: str, service: ServiceDep, user: UserDep, options: Annotated[TaskOptions, Query()]):
    return service.query_tasks(organization_id, user, **options.model_dump())


@router.get("/lifecycle", response_model=RecordPage[LifecycleItemResponse])
def lifecycle(organization_id: str, service: ServiceDep, user: UserDep, options: Annotated[LifecycleOptions, Query()]):
    return service.query_lifecycle(organization_id, user, **options.model_dump())


@router.get("/search", response_model=SearchResponse)
def search(organization_id: str, service: ServiceDep, user: UserDep, q: Annotated[str, Query(min_length=2, max_length=200)], limit: Annotated[int, Query(ge=1, le=20)] = 10):
    return service.workspace_search(organization_id, user, q, limit)


@router.get("/overview", response_model=WorkspaceOverview)
def overview(organization_id: str, service: ServiceDep, user: UserDep, day_start: datetime | None = None, week_end: datetime | None = None):
    return service.workspace_overview(organization_id, user, day_start=day_start, week_end=week_end)
