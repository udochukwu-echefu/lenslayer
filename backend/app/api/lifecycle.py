from __future__ import annotations

from fastapi import APIRouter, Response, status

from ..schemas import LifecycleItemCreate, LifecycleItemResponse, LifecycleItemUpdate
from .dependencies import ServiceDep, UserDep


router = APIRouter()


@router.get(
    "/organizations/{organization_id}/lifecycle",
    response_model=list[LifecycleItemResponse],
    tags=["lifecycle"],
)
def list_lifecycle_items(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
    contract_id: str | None = None,
    lifecycle_status: str | None = None,
) -> list[LifecycleItemResponse]:
    return [
        service.lifecycle_response(item)
        for item in service.list_lifecycle_items(
            organization_id,
            user,
            contract_id=contract_id,
            status=lifecycle_status,
        )
    ]


@router.post(
    "/organizations/{organization_id}/contracts/{contract_id}/lifecycle",
    response_model=LifecycleItemResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["lifecycle"],
)
def create_lifecycle_item(
    organization_id: str,
    contract_id: str,
    payload: LifecycleItemCreate,
    service: ServiceDep,
    user: UserDep,
) -> LifecycleItemResponse:
    item = service.create_lifecycle_item(
        organization_id,
        contract_id,
        user,
        payload.model_dump(),
    )
    return service.lifecycle_response(item)


@router.patch(
    "/organizations/{organization_id}/lifecycle/{item_id}",
    response_model=LifecycleItemResponse,
    tags=["lifecycle"],
)
def update_lifecycle_item(
    organization_id: str,
    item_id: str,
    payload: LifecycleItemUpdate,
    service: ServiceDep,
    user: UserDep,
) -> LifecycleItemResponse:
    item = service.update_lifecycle_item(
        organization_id,
        item_id,
        user,
        payload.model_dump(exclude_unset=True),
    )
    return service.lifecycle_response(item)


@router.get(
    "/organizations/{organization_id}/calendar.ics",
    tags=["lifecycle"],
)
def export_calendar(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
) -> Response:
    return Response(
        content=service.calendar_ics(organization_id, user),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="lenslayer-calendar.ics"'},
    )
