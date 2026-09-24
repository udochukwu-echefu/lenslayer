from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Form, Request, UploadFile, status

from ..schemas import (
    ContractVersionResponse,
    CounterpartyResponseCreate,
    CounterpartyResponseResponse,
    NegotiationItemCreate,
    NegotiationItemResponse,
    NegotiationItemUpdate,
    NegotiationSummaryResponse,
)
from .dependencies import ServiceDep, UserDep, read_upload


router = APIRouter()


@router.get(
    "/organizations/{organization_id}/contracts/{contract_id}/versions",
    response_model=list[ContractVersionResponse],
    tags=["negotiation"],
)
def list_contract_versions(
    organization_id: str,
    contract_id: str,
    service: ServiceDep,
    user: UserDep,
) -> list[ContractVersionResponse]:
    return [
        service.contract_version_response(item)
        for item in service.list_contract_versions(organization_id, contract_id, user)
    ]


@router.post(
    "/organizations/{organization_id}/contracts/{contract_id}/versions",
    response_model=ContractVersionResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["negotiation"],
)
async def upload_contract_version(
    organization_id: str,
    contract_id: str,
    request: Request,
    service: ServiceDep,
    user: UserDep,
    file: Annotated[UploadFile, File()],
    label: Annotated[str, Form()] = "",
    notes: Annotated[str, Form()] = "",
) -> ContractVersionResponse:
    data = await read_upload(file, request.app.state.settings.max_upload_bytes)
    version = service.create_contract_version(
        organization_id,
        contract_id,
        user,
        original_name=file.filename or "revision",
        content_type=file.content_type or "application/octet-stream",
        data=data,
        label=label,
        notes=notes,
    )
    return service.contract_version_response(version)


@router.get(
    "/organizations/{organization_id}/contracts/{contract_id}/negotiation-items",
    response_model=list[NegotiationItemResponse],
    tags=["negotiation"],
)
def list_negotiation_items(
    organization_id: str,
    contract_id: str,
    service: ServiceDep,
    user: UserDep,
) -> list[NegotiationItemResponse]:
    return [
        service.negotiation_item_response(item)
        for item in service.list_negotiation_items(organization_id, contract_id, user)
    ]


@router.post(
    "/organizations/{organization_id}/contracts/{contract_id}/negotiation-items",
    response_model=NegotiationItemResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["negotiation"],
)
def create_negotiation_item(
    organization_id: str,
    contract_id: str,
    payload: NegotiationItemCreate,
    service: ServiceDep,
    user: UserDep,
) -> NegotiationItemResponse:
    item = service.create_negotiation_item(organization_id, contract_id, user, payload.model_dump())
    return service.negotiation_item_response(item)


@router.patch(
    "/organizations/{organization_id}/contracts/{contract_id}/negotiation-items/{item_id}",
    response_model=NegotiationItemResponse,
    tags=["negotiation"],
)
def update_negotiation_item(
    organization_id: str,
    contract_id: str,
    item_id: str,
    payload: NegotiationItemUpdate,
    service: ServiceDep,
    user: UserDep,
) -> NegotiationItemResponse:
    item = service.update_negotiation_item(
        organization_id,
        contract_id,
        item_id,
        user,
        payload.model_dump(exclude_unset=True),
    )
    return service.negotiation_item_response(item)


@router.get(
    "/organizations/{organization_id}/contracts/{contract_id}/counterparty-responses",
    response_model=list[CounterpartyResponseResponse],
    tags=["negotiation"],
)
def list_counterparty_responses(
    organization_id: str,
    contract_id: str,
    service: ServiceDep,
    user: UserDep,
) -> list[CounterpartyResponseResponse]:
    return [
        service.counterparty_response_response(item)
        for item in service.list_counterparty_responses(organization_id, contract_id, user)
    ]


@router.post(
    "/organizations/{organization_id}/contracts/{contract_id}/counterparty-responses",
    response_model=CounterpartyResponseResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["negotiation"],
)
def create_counterparty_response(
    organization_id: str,
    contract_id: str,
    payload: CounterpartyResponseCreate,
    service: ServiceDep,
    user: UserDep,
) -> CounterpartyResponseResponse:
    response = service.create_counterparty_response(
        organization_id,
        contract_id,
        user,
        payload.model_dump(),
    )
    return service.counterparty_response_response(response)


@router.get(
    "/organizations/{organization_id}/contracts/{contract_id}/negotiation-summary",
    response_model=NegotiationSummaryResponse,
    tags=["negotiation"],
)
def negotiation_summary(
    organization_id: str,
    contract_id: str,
    service: ServiceDep,
    user: UserDep,
) -> NegotiationSummaryResponse:
    return service.negotiation_summary(organization_id, contract_id, user)
