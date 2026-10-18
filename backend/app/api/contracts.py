from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, File, Form, Request, Response, UploadFile, status

from ..schemas import (
    AssetResponse,
    ContractCreatedResponse,
    ContractResponse,
    DealPassportResponse,
    JobResponse,
)
from ..review_trigger import queue_review_worker
from ..services import PlatformService
from .dependencies import ServiceDep, UserDep, get_current_user, read_upload
from .uploads import UploadRoute, run_upload


router = APIRouter(route_class=UploadRoute)


@router.post(
    "/organizations/{organization_id}/contracts",
    response_model=ContractCreatedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["contracts"],
)
async def create_contract(
    organization_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    file: Annotated[UploadFile, File()],
    title: Annotated[str, Form()] = "",
    counterparty: Annotated[str, Form()] = "",
    contract_type: Annotated[str, Form()] = "Unknown",
    party_role: Annotated[str, Form()] = "Not sure / general review",
    jurisdiction: Annotated[str, Form()] = "",
    goal: Annotated[str, Form()] = "Understand before signing",
    risk_tolerance: Annotated[str, Form()] = "Balanced",
    retain_document: Annotated[bool, Form()] = False,
    retain_source_text: Annotated[bool, Form()] = False,
    retention_days: Annotated[int, Form()] = 30,
) -> ContractCreatedResponse:
    data = await read_upload(file, request.app.state.settings.max_upload_bytes)

    def create(service: PlatformService) -> ContractCreatedResponse:
        user = get_current_user(request, service)
        contract, asset, job = service.create_contract(
            organization_id,
            user,
            original_name=file.filename or "contract",
            content_type=file.content_type or "application/octet-stream",
            data=data,
            title=title,
            counterparty=counterparty,
            contract_type=contract_type,
            review_context={
                "party_role": party_role,
                "jurisdiction": jurisdiction,
                "goal": goal,
                "risk_tolerance": risk_tolerance,
            },
            retain_document=retain_document,
            retain_source_text=retain_source_text,
            retention_days=retention_days,
        )
        return ContractCreatedResponse(
            contract=service.contract_response(contract),
            asset=AssetResponse.model_validate(asset),
            job=JobResponse.model_validate(job),
        )

    result = await run_upload(request, create)
    queue_review_worker(background_tasks, request.app.state.settings)
    return result


@router.get(
    "/organizations/{organization_id}/contracts",
    response_model=list[ContractResponse],
    tags=["contracts"],
)
def list_contracts(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
) -> list[ContractResponse]:
    return [service.contract_response(item) for item in service.list_contracts(organization_id, user)]


@router.get(
    "/organizations/{organization_id}/contracts/{contract_id}",
    response_model=ContractResponse,
    tags=["contracts"],
)
def get_contract(
    organization_id: str,
    contract_id: str,
    service: ServiceDep,
    user: UserDep,
) -> ContractResponse:
    return service.contract_response(service.get_contract(organization_id, contract_id, user))


@router.get(
    "/organizations/{organization_id}/contracts/{contract_id}/jobs",
    response_model=list[JobResponse],
    tags=["jobs"],
)
def list_jobs(
    organization_id: str,
    contract_id: str,
    service: ServiceDep,
    user: UserDep,
) -> list[JobResponse]:
    return [JobResponse.model_validate(item) for item in service.list_jobs(organization_id, contract_id, user)]


@router.get(
    "/organizations/{organization_id}/contracts/{contract_id}/deal-passport",
    response_model=DealPassportResponse,
    tags=["contracts"],
)
def deal_passport(
    organization_id: str,
    contract_id: str,
    service: ServiceDep,
    user: UserDep,
) -> DealPassportResponse:
    return service.deal_passport(organization_id, contract_id, user)


@router.delete(
    "/organizations/{organization_id}/contracts/{contract_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["contracts"],
)
def delete_contract(
    organization_id: str,
    contract_id: str,
    service: ServiceDep,
    user: UserDep,
) -> Response:
    service.delete_contract(organization_id, contract_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
