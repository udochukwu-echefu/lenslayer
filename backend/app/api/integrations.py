from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, File, Form, Request, Response, UploadFile, status

from ..schemas import (
    AssetResponse,
    IntakeAddressResponse,
    IntakeCreatedResponse,
    IntegrationConnectionCreate,
    IntegrationConnectionResponse,
    IntegrationImportResponse,
    IntegrationProviderResponse,
    JobResponse,
)
from ..review_trigger import queue_review_worker
from .dependencies import ServiceDep, UserDep, read_upload


router = APIRouter()


@router.get(
    "/organizations/{organization_id}/integrations/providers",
    response_model=list[IntegrationProviderResponse],
    tags=["integrations"],
)
def list_integration_providers(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
) -> list[IntegrationProviderResponse]:
    return service.integration_providers(organization_id, user)


@router.get(
    "/organizations/{organization_id}/intake/email-address",
    response_model=IntakeAddressResponse,
    tags=["intake"],
)
def get_intake_email_address(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
) -> IntakeAddressResponse:
    return service.intake_email_address(organization_id, user)


@router.get(
    "/organizations/{organization_id}/integrations",
    response_model=list[IntegrationConnectionResponse],
    tags=["integrations"],
)
def list_integrations(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
    provider: str | None = None,
) -> list[IntegrationConnectionResponse]:
    return [
        service.integration_connection_response(item)
        for item in service.list_integration_connections(organization_id, user, provider)
    ]


@router.post(
    "/organizations/{organization_id}/integrations",
    response_model=IntegrationConnectionResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["integrations"],
)
def create_integration(
    organization_id: str,
    payload: IntegrationConnectionCreate,
    service: ServiceDep,
    user: UserDep,
) -> IntegrationConnectionResponse:
    connection = service.create_integration_connection(organization_id, user, payload.model_dump())
    return service.integration_connection_response(connection)


@router.delete(
    "/organizations/{organization_id}/integrations/{connection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["integrations"],
)
def revoke_integration(
    organization_id: str,
    connection_id: str,
    service: ServiceDep,
    user: UserDep,
) -> Response:
    service.revoke_integration_connection(organization_id, connection_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/organizations/{organization_id}/integrations/imports",
    response_model=list[IntegrationImportResponse],
    tags=["integrations"],
)
def list_integration_imports(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
    provider: str | None = None,
) -> list[IntegrationImportResponse]:
    return [
        service.integration_import_response(item)
        for item in service.list_integration_imports(organization_id, user, provider)
    ]


@router.post(
    "/organizations/{organization_id}/intake/email",
    response_model=IntakeCreatedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["intake"],
)
async def intake_forwarded_email(
    organization_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    service: ServiceDep,
    user: UserDep,
    file: Annotated[UploadFile, File()],
    sender: Annotated[str, Form()] = "",
    subject: Annotated[str, Form()] = "",
    body: Annotated[str, Form()] = "",
    external_id: Annotated[str, Form()] = "",
    retain_document: Annotated[bool, Form()] = False,
    retain_source_text: Annotated[bool, Form()] = False,
    retention_days: Annotated[int, Form()] = 30,
) -> IntakeCreatedResponse:
    data = await read_upload(file, request.app.state.settings.max_upload_bytes)
    import_record, contract, asset, job = service.create_imported_contract(
        organization_id,
        user,
        provider="email",
        source_type="forwarded_email",
        original_name=file.filename or "forwarded-contract",
        content_type=file.content_type or "application/octet-stream",
        data=data,
        title=subject or file.filename or "Forwarded contract",
        external_id=external_id,
        metadata={"sender": sender, "subject": subject, "body_excerpt": body[:500]},
        retain_document=retain_document,
        retain_source_text=retain_source_text,
        retention_days=retention_days,
    )
    queue_review_worker(background_tasks, request.app.state.settings)
    return IntakeCreatedResponse(
        import_record=service.integration_import_response(import_record),
        contract=service.contract_response(contract),
        asset=AssetResponse.model_validate(asset),
        job=JobResponse.model_validate(job),
    )


@router.post(
    "/organizations/{organization_id}/integrations/google-drive/imports",
    response_model=IntakeCreatedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["integrations"],
)
async def import_google_drive_file(
    organization_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    service: ServiceDep,
    user: UserDep,
    file: Annotated[UploadFile, File()],
    connection_id: Annotated[str, Form()] = "",
    drive_file_id: Annotated[str, Form()] = "",
    source_url: Annotated[str, Form()] = "",
    title: Annotated[str, Form()] = "",
    retain_document: Annotated[bool, Form()] = False,
    retain_source_text: Annotated[bool, Form()] = False,
    retention_days: Annotated[int, Form()] = 30,
) -> IntakeCreatedResponse:
    data = await read_upload(file, request.app.state.settings.max_upload_bytes)
    import_record, contract, asset, job = service.create_imported_contract(
        organization_id,
        user,
        provider="google_drive",
        source_type="drive_file",
        original_name=file.filename or "drive-contract",
        content_type=file.content_type or "application/octet-stream",
        data=data,
        title=title or file.filename or "Google Drive contract",
        connection_id=connection_id or None,
        external_id=drive_file_id,
        source_url=source_url,
        metadata={"drive_file_id": drive_file_id},
        retain_document=retain_document,
        retain_source_text=retain_source_text,
        retention_days=retention_days,
    )
    queue_review_worker(background_tasks, request.app.state.settings)
    return IntakeCreatedResponse(
        import_record=service.integration_import_response(import_record),
        contract=service.contract_response(contract),
        asset=AssetResponse.model_validate(asset),
        job=JobResponse.model_validate(job),
    )


@router.post(
    "/organizations/{organization_id}/integrations/{provider}/imports",
    response_model=IntakeCreatedResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["integrations"],
)
async def import_provider_file(
    organization_id: str,
    provider: str,
    request: Request,
    background_tasks: BackgroundTasks,
    service: ServiceDep,
    user: UserDep,
    file: Annotated[UploadFile, File()],
    connection_id: Annotated[str, Form()] = "",
    external_id: Annotated[str, Form()] = "",
    source_url: Annotated[str, Form()] = "",
    title: Annotated[str, Form()] = "",
    sender: Annotated[str, Form()] = "",
    channel_reference: Annotated[str, Form()] = "",
    retain_document: Annotated[bool, Form()] = False,
    retain_source_text: Annotated[bool, Form()] = False,
    retention_days: Annotated[int, Form()] = 30,
) -> IntakeCreatedResponse:
    data = await read_upload(file, request.app.state.settings.max_upload_bytes)
    import_record, contract, asset, job = service.create_imported_contract(
        organization_id,
        user,
        provider=provider,
        source_type="cloud_file" if provider in {"google_drive", "onedrive", "sharepoint", "dropbox"} else "message_attachment",
        original_name=file.filename or "imported-contract",
        content_type=file.content_type or "application/octet-stream",
        data=data,
        title=title or file.filename or "Imported contract",
        connection_id=connection_id or None,
        external_id=external_id,
        source_url=source_url,
        metadata={"sender": sender, "channel_reference": channel_reference},
        retain_document=retain_document,
        retain_source_text=retain_source_text,
        retention_days=retention_days,
    )
    queue_review_worker(background_tasks, request.app.state.settings)
    return IntakeCreatedResponse(
        import_record=service.integration_import_response(import_record),
        contract=service.contract_response(contract),
        asset=AssetResponse.model_validate(asset),
        job=JobResponse.model_validate(job),
    )
