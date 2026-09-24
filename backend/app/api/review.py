from __future__ import annotations

from fastapi import APIRouter, Response

from ..schemas import ContractQuestionCreate, ContractQuestionResponse, ReviewResponse
from .dependencies import ServiceDep, UserDep


router = APIRouter()


@router.get(
    "/organizations/{organization_id}/contracts/{contract_id}/review",
    response_model=ReviewResponse,
    tags=["reviews"],
)
def get_review(
    organization_id: str,
    contract_id: str,
    service: ServiceDep,
    user: UserDep,
) -> ReviewResponse:
    return service.review_response(service.get_review(organization_id, contract_id, user))


@router.get(
    "/organizations/{organization_id}/contracts/{contract_id}/counsel-handoff",
    tags=["reviews"],
)
def counsel_handoff(
    organization_id: str,
    contract_id: str,
    service: ServiceDep,
    user: UserDep,
) -> Response:
    content, filename = service.counsel_handoff(organization_id, contract_id, user)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/organizations/{organization_id}/contracts/{contract_id}/questions",
    response_model=ContractQuestionResponse,
    tags=["reviews"],
)
def answer_contract_question(
    organization_id: str,
    contract_id: str,
    payload: ContractQuestionCreate,
    service: ServiceDep,
    user: UserDep,
) -> ContractQuestionResponse:
    answer, sources, generated_by = service.answer_contract_question(
        organization_id,
        contract_id,
        user,
        payload.question,
    )
    return ContractQuestionResponse(answer=answer, sources=sources, generated_by=generated_by)


@router.get(
    "/organizations/{organization_id}/contracts/{contract_id}/exports/{export_format}",
    tags=["reviews"],
)
def export_contract_review(
    organization_id: str,
    contract_id: str,
    export_format: str,
    service: ServiceDep,
    user: UserDep,
) -> Response:
    content, media_type, filename = service.contract_export(
        organization_id,
        contract_id,
        user,
        export_format.casefold(),
    )
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/organizations/{organization_id}/contracts/{contract_id}/redline.docx",
    tags=["reviews"],
)
def export_contract_redline(
    organization_id: str,
    contract_id: str,
    service: ServiceDep,
    user: UserDep,
) -> Response:
    content, filename = service.redline_export(organization_id, contract_id, user)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
