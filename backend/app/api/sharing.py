from __future__ import annotations

from fastapi import APIRouter, Response, status

from ..schemas import (
    ExternalShareCreate,
    ExternalShareCreatedResponse,
    ExternalShareResponse,
    SharedContractResponse,
)
from .dependencies import ServiceDep, UserDep


router = APIRouter()


@router.get(
    "/shared/{token}",
    response_model=SharedContractResponse,
    tags=["sharing"],
)
def get_shared_contract(
    token: str,
    service: ServiceDep,
) -> SharedContractResponse:
    share, contract, analysis = service.shared_contract(token)
    return SharedContractResponse(
        contract_title=contract.title,
        counterparty=contract.counterparty,
        contract_type=contract.contract_type,
        executive_summary=str(analysis.get("executive_summary") or ""),
        overall_attention=str(analysis.get("overall_attention") or ""),
        risks=analysis.get("risk_assessment", []),
        missing_protections=analysis.get("missing_protections", []),
        negotiation_priorities=analysis.get("negotiation_priorities", []),
        expires_at=share.expires_at,
        shared_for=share.label,
    )


@router.get(
    "/organizations/{organization_id}/contracts/{contract_id}/shares",
    response_model=list[ExternalShareResponse],
    tags=["sharing"],
)
def list_external_shares(
    organization_id: str,
    contract_id: str,
    service: ServiceDep,
    user: UserDep,
) -> list[ExternalShareResponse]:
    return [
        service.external_share_response(item)
        for item in service.list_external_shares(organization_id, contract_id, user)
    ]


@router.post(
    "/organizations/{organization_id}/contracts/{contract_id}/shares",
    response_model=ExternalShareCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["sharing"],
)
def create_external_share(
    organization_id: str,
    contract_id: str,
    payload: ExternalShareCreate,
    service: ServiceDep,
    user: UserDep,
) -> ExternalShareCreatedResponse:
    share, token = service.create_external_share(
        organization_id,
        contract_id,
        user,
        payload.model_dump(),
    )
    return ExternalShareCreatedResponse(share=service.external_share_response(share), token=token)


@router.delete(
    "/organizations/{organization_id}/contracts/{contract_id}/shares/{share_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["sharing"],
)
def revoke_external_share(
    organization_id: str,
    contract_id: str,
    share_id: str,
    service: ServiceDep,
    user: UserDep,
) -> Response:
    service.revoke_external_share(organization_id, contract_id, share_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
