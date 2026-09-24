from __future__ import annotations

from fastapi import APIRouter, status

from ..schemas import (
    ApprovalRequestCreate,
    ApprovalRequestResponse,
    ApprovalResolutionCreate,
    ContractCommentCreate,
    ContractCommentResponse,
    ContractDecisionCreate,
    ContractDecisionResponse,
)
from .dependencies import ServiceDep, UserDep


router = APIRouter()


@router.get(
    "/organizations/{organization_id}/contracts/{contract_id}/comments",
    response_model=list[ContractCommentResponse],
    tags=["collaboration"],
)
def list_contract_comments(
    organization_id: str,
    contract_id: str,
    service: ServiceDep,
    user: UserDep,
) -> list[ContractCommentResponse]:
    return [
        service.contract_comment_response(item)
        for item in service.list_contract_comments(organization_id, contract_id, user)
    ]


@router.post(
    "/organizations/{organization_id}/contracts/{contract_id}/comments",
    response_model=ContractCommentResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["collaboration"],
)
def create_contract_comment(
    organization_id: str,
    contract_id: str,
    payload: ContractCommentCreate,
    service: ServiceDep,
    user: UserDep,
) -> ContractCommentResponse:
    comment = service.create_contract_comment(
        organization_id,
        contract_id,
        user,
        payload.body,
        payload.mentioned_user_ids,
    )
    return service.contract_comment_response(comment)


@router.get(
    "/organizations/{organization_id}/contracts/{contract_id}/decisions",
    response_model=list[ContractDecisionResponse],
    tags=["collaboration"],
)
def list_contract_decisions(
    organization_id: str,
    contract_id: str,
    service: ServiceDep,
    user: UserDep,
) -> list[ContractDecisionResponse]:
    return [
        service.contract_decision_response(item)
        for item in service.list_contract_decisions(organization_id, contract_id, user)
    ]


@router.post(
    "/organizations/{organization_id}/contracts/{contract_id}/decisions",
    response_model=ContractDecisionResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["collaboration"],
)
def create_contract_decision(
    organization_id: str,
    contract_id: str,
    payload: ContractDecisionCreate,
    service: ServiceDep,
    user: UserDep,
) -> ContractDecisionResponse:
    decision = service.create_contract_decision(
        organization_id,
        contract_id,
        user,
        payload.model_dump(),
    )
    return service.contract_decision_response(decision)


@router.get(
    "/organizations/{organization_id}/contracts/{contract_id}/approvals",
    response_model=list[ApprovalRequestResponse],
    tags=["approvals"],
)
def list_approval_requests(
    organization_id: str,
    contract_id: str,
    service: ServiceDep,
    user: UserDep,
) -> list[ApprovalRequestResponse]:
    return [
        service.approval_response(item)
        for item in service.list_approval_requests(organization_id, contract_id, user)
    ]


@router.post(
    "/organizations/{organization_id}/contracts/{contract_id}/approvals",
    response_model=ApprovalRequestResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["approvals"],
)
def create_approval_request(
    organization_id: str,
    contract_id: str,
    payload: ApprovalRequestCreate,
    service: ServiceDep,
    user: UserDep,
) -> ApprovalRequestResponse:
    approval = service.create_approval_request(
        organization_id,
        contract_id,
        user,
        payload.model_dump(),
    )
    return service.approval_response(approval)


@router.post(
    "/organizations/{organization_id}/contracts/{contract_id}/approvals/{approval_id}/decision",
    response_model=ApprovalRequestResponse,
    tags=["approvals"],
)
def decide_approval_request(
    organization_id: str,
    contract_id: str,
    approval_id: str,
    payload: ApprovalResolutionCreate,
    service: ServiceDep,
    user: UserDep,
) -> ApprovalRequestResponse:
    approval = service.resolve_approval_request(
        organization_id,
        contract_id,
        approval_id,
        user,
        payload.model_dump(),
    )
    return service.approval_response(approval)
