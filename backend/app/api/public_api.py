from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Form, Request, Response, UploadFile, status

from ..schemas import (
    ApiKeyCreate,
    ApiKeyCreatedResponse,
    ApiKeyResponse,
    AssetResponse,
    ContractResponse,
    IntakeCreatedResponse,
    JobResponse,
    ReviewResponse,
    WebhookDeliveryResponse,
    WebhookSubscriptionCreate,
    WebhookSubscriptionCreatedResponse,
    WebhookSubscriptionResponse,
)
from .dependencies import ServiceDep, UserDep, public_api_token, read_upload


router = APIRouter()


@router.get(
    "/organizations/{organization_id}/api-keys",
    response_model=list[ApiKeyResponse],
    tags=["public-api"],
)
def list_api_keys(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
) -> list[ApiKeyResponse]:
    return [service.api_key_response(item) for item in service.list_api_keys(organization_id, user)]


@router.post(
    "/organizations/{organization_id}/api-keys",
    response_model=ApiKeyCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["public-api"],
)
def create_api_key(
    organization_id: str,
    payload: ApiKeyCreate,
    service: ServiceDep,
    user: UserDep,
) -> ApiKeyCreatedResponse:
    return service.create_api_key(organization_id, user, payload.model_dump())


@router.delete(
    "/organizations/{organization_id}/api-keys/{api_key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["public-api"],
)
def revoke_api_key(
    organization_id: str,
    api_key_id: str,
    service: ServiceDep,
    user: UserDep,
) -> Response:
    service.revoke_api_key(organization_id, api_key_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/organizations/{organization_id}/webhooks",
    response_model=list[WebhookSubscriptionResponse],
    tags=["webhooks"],
)
def list_webhooks(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
) -> list[WebhookSubscriptionResponse]:
    return [
        service.webhook_subscription_response(item)
        for item in service.list_webhook_subscriptions(organization_id, user)
    ]


@router.post(
    "/organizations/{organization_id}/webhooks",
    response_model=WebhookSubscriptionCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["webhooks"],
)
def create_webhook(
    organization_id: str,
    payload: WebhookSubscriptionCreate,
    service: ServiceDep,
    user: UserDep,
) -> WebhookSubscriptionCreatedResponse:
    webhook, signing_secret = service.create_webhook_subscription(organization_id, user, payload.model_dump())
    return WebhookSubscriptionCreatedResponse(
        subscription=service.webhook_subscription_response(webhook),
        signing_secret=signing_secret,
    )


@router.delete(
    "/organizations/{organization_id}/webhooks/{webhook_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["webhooks"],
)
def revoke_webhook(
    organization_id: str,
    webhook_id: str,
    service: ServiceDep,
    user: UserDep,
) -> Response:
    service.revoke_webhook_subscription(organization_id, webhook_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/organizations/{organization_id}/webhook-deliveries",
    response_model=list[WebhookDeliveryResponse],
    tags=["webhooks"],
)
def list_webhook_deliveries(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
    webhook_id: str | None = None,
) -> list[WebhookDeliveryResponse]:
    return [
        service.webhook_delivery_response(item)
        for item in service.list_webhook_deliveries(organization_id, user, webhook_id)
    ]


@router.post(
    "/public/contracts",
    response_model=IntakeCreatedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["public-api"],
)
async def public_api_upload_contract(
    request: Request,
    service: ServiceDep,
    file: Annotated[UploadFile, File()],
    title: Annotated[str, Form()] = "",
    counterparty: Annotated[str, Form()] = "",
    contract_type: Annotated[str, Form()] = "Unknown",
    external_id: Annotated[str, Form()] = "",
    retain_document: Annotated[bool, Form()] = False,
    retain_source_text: Annotated[bool, Form()] = False,
    retention_days: Annotated[int, Form()] = 30,
) -> IntakeCreatedResponse:
    api_key, user = service.authenticate_api_key(public_api_token(request), "contracts:write")
    data = await read_upload(file, request.app.state.settings.max_upload_bytes)
    import_record, contract, asset, job = service.create_imported_contract(
        api_key.organization_id,
        user,
        provider="public_api",
        source_type="api_upload",
        original_name=file.filename or "api-contract",
        content_type=file.content_type or "application/octet-stream",
        data=data,
        title=title or file.filename or "API contract",
        counterparty=counterparty,
        contract_type=contract_type,
        external_id=external_id,
        metadata={"api_key_id": api_key.id},
        retain_document=retain_document,
        retain_source_text=retain_source_text,
        retention_days=retention_days,
    )
    return IntakeCreatedResponse(
        import_record=service.integration_import_response(import_record),
        contract=service.contract_response(contract),
        asset=AssetResponse.model_validate(asset),
        job=JobResponse.model_validate(job),
    )


@router.get(
    "/public/contracts/{contract_id}",
    response_model=ContractResponse,
    tags=["public-api"],
)
def public_api_get_contract(
    contract_id: str,
    request: Request,
    service: ServiceDep,
) -> ContractResponse:
    api_key, user = service.authenticate_api_key(public_api_token(request), "contracts:read")
    return service.contract_response(service.get_contract(api_key.organization_id, contract_id, user))


@router.get(
    "/public/contracts/{contract_id}/review",
    response_model=ReviewResponse,
    tags=["public-api"],
)
def public_api_get_review(
    contract_id: str,
    request: Request,
    service: ServiceDep,
) -> ReviewResponse:
    api_key, user = service.authenticate_api_key(public_api_token(request), "contracts:read")
    return service.review_response(service.get_review(api_key.organization_id, contract_id, user))
