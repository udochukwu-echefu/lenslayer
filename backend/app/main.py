from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .database import Database
from .models import Organization
from .object_storage import ObjectStore, build_object_store
from .schemas import (
    ApiKeyCreate,
    ApiKeyCreatedResponse,
    ApiKeyResponse,
    ApprovalRequestCreate,
    ApprovalRequestResponse,
    ApprovalResolutionCreate,
    AssetResponse,
    AuditEventResponse,
    ContractActivityResponse,
    ContractCommentCreate,
    ContractCommentResponse,
    ContractCreatedResponse,
    ContractDecisionCreate,
    ContractDecisionResponse,
    DealPassportResponse,
    ContractQuestionCreate,
    ContractQuestionResponse,
    ContractResponse,
    ContractVersionResponse,
    CounterpartyResponseCreate,
    CounterpartyResponseResponse,
    ExternalShareCreate,
    ExternalShareCreatedResponse,
    ExternalShareResponse,
    HealthResponse,
    IntegrationConnectionCreate,
    IntegrationConnectionResponse,
    IntegrationImportResponse,
    IntegrationProviderResponse,
    IntakeAddressResponse,
    IntakeCreatedResponse,
    InvitationAcceptResponse,
    InvitationCreate,
    InvitationCreatedResponse,
    InvitationPreviewResponse,
    InvitationResponse,
    JobResponse,
    LifecycleItemCreate,
    LifecycleItemResponse,
    LifecycleItemUpdate,
    MembershipResponse,
    MembershipRoleUpdate,
    NegotiationItemCreate,
    NegotiationItemResponse,
    NegotiationItemUpdate,
    NegotiationSummaryResponse,
    NotificationResponse,
    OrganizationCreate,
    OrganizationResponse,
    OrganizationSettingsResponse,
    OrganizationSettingsUpdate,
    PortfolioQuestionCreate,
    PortfolioQuestionResponse,
    ReportOverviewResponse,
    ReportRangeName,
    ReviewResponse,
    SharedContractResponse,
    SecureIntakeLinkCreate,
    SecureIntakeLinkCreatedResponse,
    SecureIntakeLinkResponse,
    SecureIntakePreviewResponse,
    SecureIntakeUploadResponse,
    TaskCreate,
    TaskResponse,
    TaskStatusName,
    TaskUpdate,
    UserResponse,
    VerificationActionName,
    VerificationAssignmentCreate,
    VerificationAssignmentResponse,
    VerificationCaseResponse,
    VerificationCaseSummaryResponse,
    VerificationCaseUpdate,
    VerificationDecisionCreate,
    VerificationDecisionResponse,
    VerificationDocumentResponse,
    VerificationDocumentReview,
    VerificationPriorityName,
    VerificationReconciliationResponse,
    VerificationReconciliationUpsert,
    VerificationStatusName,
    WebhookDeliveryResponse,
    WebhookSubscriptionCreate,
    WebhookSubscriptionCreatedResponse,
    WebhookSubscriptionResponse,
)
from .security import resolve_principal
from .services import PlatformService, json_load


def get_session(request: Request):
    database: Database = request.app.state.database
    yield from database.session()


def get_store(request: Request) -> ObjectStore:
    return request.app.state.object_store


def get_platform_service(
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    object_store: Annotated[ObjectStore, Depends(get_store)],
) -> PlatformService:
    return PlatformService(session, request.app.state.settings, object_store)


async def read_upload(upload: UploadFile, maximum: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > maximum:
            raise HTTPException(status_code=413, detail="The uploaded document exceeds the 25 MB limit.")
        chunks.append(chunk)
    return b"".join(chunks)


def public_api_token(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        return token.strip()
    token = request.headers.get("x-lenslayer-api-key", "").strip()
    if token:
        return token
    raise HTTPException(status_code=401, detail="A Lenslayer API key is required.")


def create_app(settings: Settings | None = None) -> FastAPI:
    runtime_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database = Database(runtime_settings)
        if runtime_settings.auto_create_schema:
            database.create_schema()
        app.state.settings = runtime_settings
        app.state.database = database
        app.state.object_store = build_object_store(runtime_settings)
        yield
        database.dispose()

    application = FastAPI(
        title=runtime_settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if runtime_settings.environment.lower() != "production" else None,
        redoc_url=None,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=runtime_settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Lenslayer-User", "X-Lenslayer-Email", "X-Lenslayer-Name"],
    )

    @application.get("/health/live", response_model=HealthResponse, tags=["health"])
    def live(request: Request) -> HealthResponse:
        settings_value: Settings = request.app.state.settings
        return HealthResponse(status="ok", service="platform-api", environment=settings_value.environment)

    @application.get("/health/ready", response_model=HealthResponse, tags=["health"])
    def ready(request: Request) -> HealthResponse:
        database: Database = request.app.state.database
        object_store: ObjectStore = request.app.state.object_store
        try:
            with database.session_factory() as session:
                session.execute(text("SELECT 1"))
        except Exception as exc:
            raise HTTPException(status_code=503, detail="Database is unavailable.") from exc
        if not object_store.healthy():
            raise HTTPException(status_code=503, detail="Object storage is unavailable.")
        return HealthResponse(status="ready", service="platform-api", environment=request.app.state.settings.environment)

    prefix = runtime_settings.api_prefix.rstrip("/")

    @application.get(f"{prefix}/me", response_model=UserResponse, tags=["identity"])
    def me(
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> UserResponse:
        user = service.ensure_user(resolve_principal(request))
        return UserResponse.model_validate(user)

    @application.post(
        f"{prefix}/organizations",
        response_model=OrganizationResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["organizations"],
    )
    def create_organization(
        payload: OrganizationCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> OrganizationResponse:
        user = service.ensure_user(resolve_principal(request))
        organization = service.create_organization(user, payload.name, payload.slug)
        return OrganizationResponse.model_validate(organization).model_copy(update={"role": "owner"})

    @application.get(f"{prefix}/organizations", response_model=list[OrganizationResponse], tags=["organizations"])
    def list_organizations(
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[OrganizationResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            OrganizationResponse.model_validate(organization).model_copy(update={"role": role})
            for organization, role in service.list_organizations(user)
        ]

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/settings",
        response_model=OrganizationSettingsResponse,
        tags=["organizations"],
    )
    def get_organization_settings(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> OrganizationSettingsResponse:
        user = service.ensure_user(resolve_principal(request))
        settings_value = service.organization_settings(organization_id, user)
        return service.organization_settings_response(settings_value)

    @application.patch(
        f"{prefix}/organizations/{{organization_id}}/settings",
        response_model=OrganizationSettingsResponse,
        tags=["organizations"],
    )
    def update_organization_settings(
        organization_id: str,
        payload: OrganizationSettingsUpdate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> OrganizationSettingsResponse:
        user = service.ensure_user(resolve_principal(request))
        settings_value = service.update_organization_settings(
            organization_id,
            user,
            payload.model_dump(exclude_unset=True),
        )
        return service.organization_settings_response(settings_value)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/members",
        response_model=list[MembershipResponse],
        tags=["team"],
    )
    def list_members(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[MembershipResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [service.membership_response(item) for item in service.list_members(organization_id, user)]

    @application.patch(
        f"{prefix}/organizations/{{organization_id}}/members/{{membership_id}}",
        response_model=MembershipResponse,
        tags=["team"],
    )
    def update_member_role(
        organization_id: str,
        membership_id: str,
        payload: MembershipRoleUpdate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> MembershipResponse:
        user = service.ensure_user(resolve_principal(request))
        membership = service.update_member_role(organization_id, membership_id, payload.role, user)
        return service.membership_response(membership)

    @application.delete(
        f"{prefix}/organizations/{{organization_id}}/members/{{membership_id}}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["team"],
    )
    def remove_member(
        organization_id: str,
        membership_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> Response:
        user = service.ensure_user(resolve_principal(request))
        service.remove_member(organization_id, membership_id, user)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/invitations",
        response_model=list[InvitationResponse],
        tags=["team"],
    )
    def list_invitations(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[InvitationResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [service.invitation_response(item) for item in service.list_invitations(organization_id, user)]

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/invitations",
        response_model=InvitationCreatedResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["team"],
    )
    def create_invitation(
        organization_id: str,
        payload: InvitationCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> InvitationCreatedResponse:
        user = service.ensure_user(resolve_principal(request))
        invitation, token = service.create_invitation(organization_id, user, payload.email, payload.role)
        return InvitationCreatedResponse(invitation=service.invitation_response(invitation), token=token)

    @application.delete(
        f"{prefix}/organizations/{{organization_id}}/invitations/{{invitation_id}}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["team"],
    )
    def revoke_invitation(
        organization_id: str,
        invitation_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> Response:
        user = service.ensure_user(resolve_principal(request))
        service.revoke_invitation(organization_id, invitation_id, user)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @application.get(
        f"{prefix}/invitations/{{token}}",
        response_model=InvitationPreviewResponse,
        tags=["team"],
    )
    def preview_invitation(
        token: str,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> InvitationPreviewResponse:
        return service.invitation_preview(service.find_invitation(token))

    @application.post(
        f"{prefix}/invitations/{{token}}/accept",
        response_model=InvitationAcceptResponse,
        tags=["team"],
    )
    def accept_invitation(
        token: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> InvitationAcceptResponse:
        user = service.ensure_user(resolve_principal(request))
        organization, membership = service.accept_invitation(token, user)
        organization_response = OrganizationResponse.model_validate(organization).model_copy(
            update={"role": membership.role}
        )
        return InvitationAcceptResponse(
            organization=organization_response,
            membership=service.membership_response(membership),
        )

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/tasks",
        response_model=list[TaskResponse],
        tags=["tasks"],
    )
    def list_tasks(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
        task_status: TaskStatusName | None = None,
        assigned_to_user_id: str | None = None,
        contract_id: str | None = None,
        due_before: datetime | None = None,
        due_after: datetime | None = None,
    ) -> list[TaskResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.task_response(item)
            for item in service.list_tasks(
                organization_id,
                user,
                status=task_status,
                assigned_to_user_id=assigned_to_user_id,
                contract_id=contract_id,
                due_before=due_before,
                due_after=due_after,
            )
        ]

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/tasks",
        response_model=TaskResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["tasks"],
    )
    def create_task(
        organization_id: str,
        payload: TaskCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> TaskResponse:
        user = service.ensure_user(resolve_principal(request))
        task = service.create_task(organization_id, user, payload.model_dump())
        return service.task_response(task)

    @application.patch(
        f"{prefix}/organizations/{{organization_id}}/tasks/{{task_id}}",
        response_model=TaskResponse,
        tags=["tasks"],
    )
    def update_task(
        organization_id: str,
        task_id: str,
        payload: TaskUpdate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> TaskResponse:
        user = service.ensure_user(resolve_principal(request))
        task = service.update_task(
            organization_id,
            task_id,
            user,
            payload.model_dump(exclude_unset=True),
        )
        return service.task_response(task)

    @application.delete(
        f"{prefix}/organizations/{{organization_id}}/tasks/{{task_id}}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["tasks"],
    )
    def delete_task(
        organization_id: str,
        task_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> Response:
        user = service.ensure_user(resolve_principal(request))
        service.delete_task(organization_id, task_id, user)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/verification-cases",
        response_model=list[VerificationCaseSummaryResponse],
        tags=["verification"],
    )
    def list_verification_cases(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
        case_status: VerificationStatusName | None = None,
        suggested_action: VerificationActionName | None = None,
        priority: VerificationPriorityName | None = None,
        assigned_to_user_id: str | None = None,
        search: str | None = None,
    ) -> list[VerificationCaseSummaryResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.verification_case_summary_response(item)
            for item in service.list_verification_cases(
                organization_id,
                user,
                status=case_status,
                suggested_action=suggested_action,
                priority=priority,
                assigned_to_user_id=assigned_to_user_id,
                search=search,
            )
        ]

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/verification-cases",
        response_model=VerificationCaseResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["verification"],
    )
    async def create_verification_case(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
        files: Annotated[list[UploadFile], File()],
        applicant_name: Annotated[str, Form()],
        applicant_email: Annotated[str, Form()] = "",
        reference: Annotated[str, Form()] = "",
        priority: Annotated[VerificationPriorityName, Form()] = "normal",
        assigned_to_user_id: Annotated[str, Form()] = "",
        due_at: Annotated[datetime | None, Form()] = None,
        retention_days: Annotated[int, Form()] = 30,
        document_type: Annotated[str, Form()] = "supporting_document",
    ) -> VerificationCaseResponse:
        user = service.ensure_user(resolve_principal(request))
        uploads = [
            {
                "original_name": item.filename or "onboarding-document",
                "content_type": item.content_type or "application/octet-stream",
                "data": await read_upload(item, request.app.state.settings.max_upload_bytes),
                "document_type": document_type,
            }
            for item in files
        ]
        case = service.create_verification_case(
            organization_id,
            user,
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            reference=reference,
            priority=priority,
            assigned_to_user_id=assigned_to_user_id or None,
            due_at=due_at,
            retention_days=retention_days,
            intake_channel="dashboard",
            uploads=uploads,
        )
        return service.verification_case_response(case)

    @application.patch(
        f"{prefix}/organizations/{{organization_id}}/verification-cases/{{case_id}}",
        response_model=VerificationCaseResponse,
        tags=["verification"],
    )
    def update_verification_case(
        organization_id: str,
        case_id: str,
        payload: VerificationCaseUpdate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> VerificationCaseResponse:
        user = service.ensure_user(resolve_principal(request))
        case = service.update_verification_case(
            organization_id,
            case_id,
            user,
            payload.model_dump(exclude_unset=True),
        )
        return service.verification_case_response(case)

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/verification-cases/{{case_id}}/assignments",
        response_model=VerificationAssignmentResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["verification"],
    )
    def assign_verification_case(
        organization_id: str,
        case_id: str,
        payload: VerificationAssignmentCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> VerificationAssignmentResponse:
        user = service.ensure_user(resolve_principal(request))
        assignment = service.assign_verification_case(
            organization_id,
            case_id,
            user,
            assigned_to_user_id=payload.assigned_to_user_id,
            note=payload.note,
        )
        return service.verification_assignment_response(assignment)

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/verification-cases/{{case_id}}/reconciliations",
        response_model=VerificationReconciliationResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["verification"],
    )
    def reconcile_verification_evidence(
        organization_id: str,
        case_id: str,
        payload: VerificationReconciliationUpsert,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> VerificationReconciliationResponse:
        user = service.ensure_user(resolve_principal(request))
        record = service.upsert_verification_reconciliation(
            organization_id,
            case_id,
            user,
            payload.model_dump(),
        )
        return service.verification_reconciliation_response(record)

    @application.patch(
        f"{prefix}/organizations/{{organization_id}}/verification-cases/{{case_id}}/documents/{{document_id}}",
        response_model=VerificationDocumentResponse,
        tags=["verification"],
    )
    def review_verification_document(
        organization_id: str,
        case_id: str,
        document_id: str,
        payload: VerificationDocumentReview,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> VerificationDocumentResponse:
        user = service.ensure_user(resolve_principal(request))
        document = service.review_verification_document(
            organization_id,
            case_id,
            document_id,
            user,
            **payload.model_dump(),
        )
        return service.verification_document_response(document)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/verification-cases/{{case_id}}/audit-events",
        response_model=list[AuditEventResponse],
        tags=["verification", "audit"],
    )
    def list_verification_audit_events(
        organization_id: str,
        case_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[AuditEventResponse]:
        user = service.ensure_user(resolve_principal(request))
        return service.list_verification_audit_events(organization_id, case_id, user)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/secure-intake-links",
        response_model=list[SecureIntakeLinkResponse],
        tags=["intake"],
    )
    def list_secure_intake_links(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[SecureIntakeLinkResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.secure_intake_link_response(item)
            for item in service.list_secure_intake_links(organization_id, user)
        ]

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/secure-intake-links",
        response_model=SecureIntakeLinkCreatedResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["intake"],
    )
    def create_secure_intake_link(
        organization_id: str,
        payload: SecureIntakeLinkCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> SecureIntakeLinkCreatedResponse:
        user = service.ensure_user(resolve_principal(request))
        link, token = service.create_secure_intake_link(
            organization_id,
            user,
            payload.model_dump(),
        )
        return SecureIntakeLinkCreatedResponse(
            intake_link=service.secure_intake_link_response(link),
            token=token,
        )

    @application.delete(
        f"{prefix}/organizations/{{organization_id}}/secure-intake-links/{{link_id}}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["intake"],
    )
    def revoke_secure_intake_link(
        organization_id: str,
        link_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> Response:
        user = service.ensure_user(resolve_principal(request))
        service.revoke_secure_intake_link(organization_id, link_id, user)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @application.get(
        f"{prefix}/secure-intake/{{token}}",
        response_model=SecureIntakePreviewResponse,
        tags=["intake"],
    )
    def preview_secure_intake(
        token: str,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> SecureIntakePreviewResponse:
        link = service.resolve_secure_intake_link(token, require_active=False)
        organization = service.session.get(Organization, link.organization_id)
        return SecureIntakePreviewResponse(
            organization_name=organization.name if organization else "Lenslayer workspace",
            applicant_name=link.applicant_name,
            message=link.message,
            remaining_uploads=max(link.max_uploads - link.upload_count, 0),
            status=service.secure_intake_status(link),
            expires_at=link.expires_at,
        )

    @application.post(
        f"{prefix}/secure-intake/{{token}}/documents",
        response_model=SecureIntakeUploadResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["intake"],
    )
    async def upload_secure_intake_documents(
        token: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
        files: Annotated[list[UploadFile], File()],
        document_type: Annotated[str, Form()] = "supporting_document",
    ) -> SecureIntakeUploadResponse:
        uploads = [
            {
                "original_name": item.filename or "onboarding-document",
                "content_type": item.content_type or "application/octet-stream",
                "data": await read_upload(item, request.app.state.settings.max_upload_bytes),
                "document_type": document_type,
            }
            for item in files
        ]
        case, documents = service.upload_secure_intake_documents(token, uploads)
        return SecureIntakeUploadResponse(
            verification_case=service.verification_case_summary_response(case),
            documents=[service.verification_document_response(item) for item in documents],
        )

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/verification-cases/bootstrap",
        response_model=list[VerificationCaseSummaryResponse],
        tags=["verification"],
    )
    def bootstrap_verification_cases(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[VerificationCaseSummaryResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.verification_case_summary_response(item)
            for item in service.bootstrap_verification_cases(organization_id, user)
        ]

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/verification-cases/{{case_id}}",
        response_model=VerificationCaseResponse,
        tags=["verification"],
    )
    def get_verification_case(
        organization_id: str,
        case_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> VerificationCaseResponse:
        user = service.ensure_user(resolve_principal(request))
        case = service.get_verification_case(organization_id, case_id, user)
        return service.verification_case_response(case)

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/verification-cases/{{case_id}}/decisions",
        response_model=VerificationDecisionResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["verification"],
    )
    def record_verification_decision(
        organization_id: str,
        case_id: str,
        payload: VerificationDecisionCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> VerificationDecisionResponse:
        user = service.ensure_user(resolve_principal(request))
        decision = service.record_verification_decision(
            organization_id,
            case_id,
            user,
            decision=payload.decision,
            rationale=payload.rationale,
        )
        return service.verification_decision_response(decision)

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/contracts",
        response_model=ContractCreatedResponse,
        status_code=status.HTTP_202_ACCEPTED,
        tags=["contracts"],
    )
    async def create_contract(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
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
        user = service.ensure_user(resolve_principal(request))
        data = await read_upload(file, request.app.state.settings.max_upload_bytes)
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

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts",
        response_model=list[ContractResponse],
        tags=["contracts"],
    )
    def list_contracts(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[ContractResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [service.contract_response(item) for item in service.list_contracts(organization_id, user)]

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}",
        response_model=ContractResponse,
        tags=["contracts"],
    )
    def get_contract(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> ContractResponse:
        user = service.ensure_user(resolve_principal(request))
        return service.contract_response(service.get_contract(organization_id, contract_id, user))

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/jobs",
        response_model=list[JobResponse],
        tags=["jobs"],
    )
    def list_jobs(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[JobResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [JobResponse.model_validate(item) for item in service.list_jobs(organization_id, contract_id, user)]

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/review",
        response_model=ReviewResponse,
        tags=["reviews"],
    )
    def get_review(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> ReviewResponse:
        user = service.ensure_user(resolve_principal(request))
        return service.review_response(service.get_review(organization_id, contract_id, user))

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/integrations/providers",
        response_model=list[IntegrationProviderResponse],
        tags=["integrations"],
    )
    def list_integration_providers(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[IntegrationProviderResponse]:
        user = service.ensure_user(resolve_principal(request))
        return service.integration_providers(organization_id, user)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/intake/email-address",
        response_model=IntakeAddressResponse,
        tags=["intake"],
    )
    def get_intake_email_address(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> IntakeAddressResponse:
        user = service.ensure_user(resolve_principal(request))
        return service.intake_email_address(organization_id, user)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/integrations",
        response_model=list[IntegrationConnectionResponse],
        tags=["integrations"],
    )
    def list_integrations(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
        provider: str | None = None,
    ) -> list[IntegrationConnectionResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.integration_connection_response(item)
            for item in service.list_integration_connections(organization_id, user, provider)
        ]

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/integrations",
        response_model=IntegrationConnectionResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["integrations"],
    )
    def create_integration(
        organization_id: str,
        payload: IntegrationConnectionCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> IntegrationConnectionResponse:
        user = service.ensure_user(resolve_principal(request))
        connection = service.create_integration_connection(organization_id, user, payload.model_dump())
        return service.integration_connection_response(connection)

    @application.delete(
        f"{prefix}/organizations/{{organization_id}}/integrations/{{connection_id}}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["integrations"],
    )
    def revoke_integration(
        organization_id: str,
        connection_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> Response:
        user = service.ensure_user(resolve_principal(request))
        service.revoke_integration_connection(organization_id, connection_id, user)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/integrations/imports",
        response_model=list[IntegrationImportResponse],
        tags=["integrations"],
    )
    def list_integration_imports(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
        provider: str | None = None,
    ) -> list[IntegrationImportResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.integration_import_response(item)
            for item in service.list_integration_imports(organization_id, user, provider)
        ]

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/intake/email",
        response_model=IntakeCreatedResponse,
        status_code=status.HTTP_202_ACCEPTED,
        tags=["intake"],
    )
    async def intake_forwarded_email(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
        file: Annotated[UploadFile, File()],
        sender: Annotated[str, Form()] = "",
        subject: Annotated[str, Form()] = "",
        body: Annotated[str, Form()] = "",
        external_id: Annotated[str, Form()] = "",
        retain_document: Annotated[bool, Form()] = False,
        retain_source_text: Annotated[bool, Form()] = False,
        retention_days: Annotated[int, Form()] = 30,
    ) -> IntakeCreatedResponse:
        user = service.ensure_user(resolve_principal(request))
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
        return IntakeCreatedResponse(
            import_record=service.integration_import_response(import_record),
            contract=service.contract_response(contract),
            asset=AssetResponse.model_validate(asset),
            job=JobResponse.model_validate(job),
        )

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/integrations/google-drive/imports",
        response_model=IntakeCreatedResponse,
        status_code=status.HTTP_202_ACCEPTED,
        tags=["integrations"],
    )
    async def import_google_drive_file(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
        file: Annotated[UploadFile, File()],
        connection_id: Annotated[str, Form()] = "",
        drive_file_id: Annotated[str, Form()] = "",
        source_url: Annotated[str, Form()] = "",
        title: Annotated[str, Form()] = "",
        retain_document: Annotated[bool, Form()] = False,
        retain_source_text: Annotated[bool, Form()] = False,
        retention_days: Annotated[int, Form()] = 30,
    ) -> IntakeCreatedResponse:
        user = service.ensure_user(resolve_principal(request))
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
        return IntakeCreatedResponse(
            import_record=service.integration_import_response(import_record),
            contract=service.contract_response(contract),
            asset=AssetResponse.model_validate(asset),
            job=JobResponse.model_validate(job),
        )

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/integrations/{{provider}}/imports",
        response_model=IntakeCreatedResponse,
        status_code=status.HTTP_202_ACCEPTED,
        tags=["integrations"],
    )
    async def import_provider_file(
        organization_id: str,
        provider: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
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
        user = service.ensure_user(resolve_principal(request))
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
        return IntakeCreatedResponse(
            import_record=service.integration_import_response(import_record),
            contract=service.contract_response(contract),
            asset=AssetResponse.model_validate(asset),
            job=JobResponse.model_validate(job),
        )

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/api-keys",
        response_model=list[ApiKeyResponse],
        tags=["public-api"],
    )
    def list_api_keys(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[ApiKeyResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [service.api_key_response(item) for item in service.list_api_keys(organization_id, user)]

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/api-keys",
        response_model=ApiKeyCreatedResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["public-api"],
    )
    def create_api_key(
        organization_id: str,
        payload: ApiKeyCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> ApiKeyCreatedResponse:
        user = service.ensure_user(resolve_principal(request))
        return service.create_api_key(organization_id, user, payload.model_dump())

    @application.delete(
        f"{prefix}/organizations/{{organization_id}}/api-keys/{{api_key_id}}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["public-api"],
    )
    def revoke_api_key(
        organization_id: str,
        api_key_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> Response:
        user = service.ensure_user(resolve_principal(request))
        service.revoke_api_key(organization_id, api_key_id, user)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/webhooks",
        response_model=list[WebhookSubscriptionResponse],
        tags=["webhooks"],
    )
    def list_webhooks(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[WebhookSubscriptionResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.webhook_subscription_response(item)
            for item in service.list_webhook_subscriptions(organization_id, user)
        ]

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/webhooks",
        response_model=WebhookSubscriptionCreatedResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["webhooks"],
    )
    def create_webhook(
        organization_id: str,
        payload: WebhookSubscriptionCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> WebhookSubscriptionCreatedResponse:
        user = service.ensure_user(resolve_principal(request))
        webhook, signing_secret = service.create_webhook_subscription(organization_id, user, payload.model_dump())
        return WebhookSubscriptionCreatedResponse(
            subscription=service.webhook_subscription_response(webhook),
            signing_secret=signing_secret,
        )

    @application.delete(
        f"{prefix}/organizations/{{organization_id}}/webhooks/{{webhook_id}}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["webhooks"],
    )
    def revoke_webhook(
        organization_id: str,
        webhook_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> Response:
        user = service.ensure_user(resolve_principal(request))
        service.revoke_webhook_subscription(organization_id, webhook_id, user)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/webhook-deliveries",
        response_model=list[WebhookDeliveryResponse],
        tags=["webhooks"],
    )
    def list_webhook_deliveries(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
        webhook_id: str | None = None,
    ) -> list[WebhookDeliveryResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.webhook_delivery_response(item)
            for item in service.list_webhook_deliveries(organization_id, user, webhook_id)
        ]

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/versions",
        response_model=list[ContractVersionResponse],
        tags=["negotiation"],
    )
    def list_contract_versions(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[ContractVersionResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.contract_version_response(item)
            for item in service.list_contract_versions(organization_id, contract_id, user)
        ]

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/versions",
        response_model=ContractVersionResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["negotiation"],
    )
    async def upload_contract_version(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
        file: Annotated[UploadFile, File()],
        label: Annotated[str, Form()] = "",
        notes: Annotated[str, Form()] = "",
    ) -> ContractVersionResponse:
        user = service.ensure_user(resolve_principal(request))
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

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/negotiation-items",
        response_model=list[NegotiationItemResponse],
        tags=["negotiation"],
    )
    def list_negotiation_items(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[NegotiationItemResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.negotiation_item_response(item)
            for item in service.list_negotiation_items(organization_id, contract_id, user)
        ]

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/negotiation-items",
        response_model=NegotiationItemResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["negotiation"],
    )
    def create_negotiation_item(
        organization_id: str,
        contract_id: str,
        payload: NegotiationItemCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> NegotiationItemResponse:
        user = service.ensure_user(resolve_principal(request))
        item = service.create_negotiation_item(organization_id, contract_id, user, payload.model_dump())
        return service.negotiation_item_response(item)

    @application.patch(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/negotiation-items/{{item_id}}",
        response_model=NegotiationItemResponse,
        tags=["negotiation"],
    )
    def update_negotiation_item(
        organization_id: str,
        contract_id: str,
        item_id: str,
        payload: NegotiationItemUpdate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> NegotiationItemResponse:
        user = service.ensure_user(resolve_principal(request))
        item = service.update_negotiation_item(
            organization_id,
            contract_id,
            item_id,
            user,
            payload.model_dump(exclude_unset=True),
        )
        return service.negotiation_item_response(item)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/counterparty-responses",
        response_model=list[CounterpartyResponseResponse],
        tags=["negotiation"],
    )
    def list_counterparty_responses(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[CounterpartyResponseResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.counterparty_response_response(item)
            for item in service.list_counterparty_responses(organization_id, contract_id, user)
        ]

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/counterparty-responses",
        response_model=CounterpartyResponseResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["negotiation"],
    )
    def create_counterparty_response(
        organization_id: str,
        contract_id: str,
        payload: CounterpartyResponseCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> CounterpartyResponseResponse:
        user = service.ensure_user(resolve_principal(request))
        response = service.create_counterparty_response(
            organization_id,
            contract_id,
            user,
            payload.model_dump(),
        )
        return service.counterparty_response_response(response)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/negotiation-summary",
        response_model=NegotiationSummaryResponse,
        tags=["negotiation"],
    )
    def negotiation_summary(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> NegotiationSummaryResponse:
        user = service.ensure_user(resolve_principal(request))
        return service.negotiation_summary(organization_id, contract_id, user)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/deal-passport",
        response_model=DealPassportResponse,
        tags=["contracts"],
    )
    def deal_passport(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> DealPassportResponse:
        user = service.ensure_user(resolve_principal(request))
        return service.deal_passport(organization_id, contract_id, user)

    @application.post(
        f"{prefix}/public/contracts",
        response_model=IntakeCreatedResponse,
        status_code=status.HTTP_202_ACCEPTED,
        tags=["public-api"],
    )
    async def public_api_upload_contract(
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
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

    @application.get(
        f"{prefix}/public/contracts/{{contract_id}}",
        response_model=ContractResponse,
        tags=["public-api"],
    )
    def public_api_get_contract(
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> ContractResponse:
        api_key, user = service.authenticate_api_key(public_api_token(request), "contracts:read")
        return service.contract_response(service.get_contract(api_key.organization_id, contract_id, user))

    @application.get(
        f"{prefix}/public/contracts/{{contract_id}}/review",
        response_model=ReviewResponse,
        tags=["public-api"],
    )
    def public_api_get_review(
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> ReviewResponse:
        api_key, user = service.authenticate_api_key(public_api_token(request), "contracts:read")
        return service.review_response(service.get_review(api_key.organization_id, contract_id, user))

    @application.get(
        f"{prefix}/shared/{{token}}",
        response_model=SharedContractResponse,
        tags=["sharing"],
    )
    def get_shared_contract(
        token: str,
        service: Annotated[PlatformService, Depends(get_platform_service)],
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

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/comments",
        response_model=list[ContractCommentResponse],
        tags=["collaboration"],
    )
    def list_contract_comments(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[ContractCommentResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.contract_comment_response(item)
            for item in service.list_contract_comments(organization_id, contract_id, user)
        ]

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/comments",
        response_model=ContractCommentResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["collaboration"],
    )
    def create_contract_comment(
        organization_id: str,
        contract_id: str,
        payload: ContractCommentCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> ContractCommentResponse:
        user = service.ensure_user(resolve_principal(request))
        comment = service.create_contract_comment(
            organization_id,
            contract_id,
            user,
            payload.body,
            payload.mentioned_user_ids,
        )
        return service.contract_comment_response(comment)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/decisions",
        response_model=list[ContractDecisionResponse],
        tags=["collaboration"],
    )
    def list_contract_decisions(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[ContractDecisionResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.contract_decision_response(item)
            for item in service.list_contract_decisions(organization_id, contract_id, user)
        ]

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/decisions",
        response_model=ContractDecisionResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["collaboration"],
    )
    def create_contract_decision(
        organization_id: str,
        contract_id: str,
        payload: ContractDecisionCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> ContractDecisionResponse:
        user = service.ensure_user(resolve_principal(request))
        decision = service.create_contract_decision(
            organization_id,
            contract_id,
            user,
            payload.model_dump(),
        )
        return service.contract_decision_response(decision)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/approvals",
        response_model=list[ApprovalRequestResponse],
        tags=["approvals"],
    )
    def list_approval_requests(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[ApprovalRequestResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.approval_response(item)
            for item in service.list_approval_requests(organization_id, contract_id, user)
        ]

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/approvals",
        response_model=ApprovalRequestResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["approvals"],
    )
    def create_approval_request(
        organization_id: str,
        contract_id: str,
        payload: ApprovalRequestCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> ApprovalRequestResponse:
        user = service.ensure_user(resolve_principal(request))
        approval = service.create_approval_request(
            organization_id,
            contract_id,
            user,
            payload.model_dump(),
        )
        return service.approval_response(approval)

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/approvals/{{approval_id}}/decision",
        response_model=ApprovalRequestResponse,
        tags=["approvals"],
    )
    def decide_approval_request(
        organization_id: str,
        contract_id: str,
        approval_id: str,
        payload: ApprovalResolutionCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> ApprovalRequestResponse:
        user = service.ensure_user(resolve_principal(request))
        approval = service.resolve_approval_request(
            organization_id,
            contract_id,
            approval_id,
            user,
            payload.model_dump(),
        )
        return service.approval_response(approval)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/shares",
        response_model=list[ExternalShareResponse],
        tags=["sharing"],
    )
    def list_external_shares(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> list[ExternalShareResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.external_share_response(item)
            for item in service.list_external_shares(organization_id, contract_id, user)
        ]

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/shares",
        response_model=ExternalShareCreatedResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["sharing"],
    )
    def create_external_share(
        organization_id: str,
        contract_id: str,
        payload: ExternalShareCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> ExternalShareCreatedResponse:
        user = service.ensure_user(resolve_principal(request))
        share, token = service.create_external_share(
            organization_id,
            contract_id,
            user,
            payload.model_dump(),
        )
        return ExternalShareCreatedResponse(share=service.external_share_response(share), token=token)

    @application.delete(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/shares/{{share_id}}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["sharing"],
    )
    def revoke_external_share(
        organization_id: str,
        contract_id: str,
        share_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> Response:
        user = service.ensure_user(resolve_principal(request))
        service.revoke_external_share(organization_id, contract_id, share_id, user)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/activity",
        response_model=list[ContractActivityResponse],
        tags=["audit"],
    )
    def contract_activity(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
        limit: int = 200,
    ) -> list[ContractActivityResponse]:
        user = service.ensure_user(resolve_principal(request))
        return service.contract_activity(organization_id, contract_id, user, limit)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/counsel-handoff",
        tags=["reviews"],
    )
    def counsel_handoff(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> Response:
        user = service.ensure_user(resolve_principal(request))
        content, filename = service.counsel_handoff(organization_id, contract_id, user)
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/questions",
        response_model=ContractQuestionResponse,
        tags=["reviews"],
    )
    def answer_contract_question(
        organization_id: str,
        contract_id: str,
        payload: ContractQuestionCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> ContractQuestionResponse:
        user = service.ensure_user(resolve_principal(request))
        answer, sources, generated_by = service.answer_contract_question(
            organization_id,
            contract_id,
            user,
            payload.question,
        )
        return ContractQuestionResponse(answer=answer, sources=sources, generated_by=generated_by)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/exports/{{export_format}}",
        tags=["reviews"],
    )
    def export_contract_review(
        organization_id: str,
        contract_id: str,
        export_format: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> Response:
        user = service.ensure_user(resolve_principal(request))
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

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/redline.docx",
        tags=["reviews"],
    )
    def export_contract_redline(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> Response:
        user = service.ensure_user(resolve_principal(request))
        content, filename = service.redline_export(organization_id, contract_id, user)
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @application.delete(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["contracts"],
    )
    def delete_contract(
        organization_id: str,
        contract_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> Response:
        user = service.ensure_user(resolve_principal(request))
        service.delete_contract(organization_id, contract_id, user)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/audit-events",
        response_model=list[AuditEventResponse],
        tags=["audit"],
    )
    def list_audit_events(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
        limit: int = 100,
    ) -> list[AuditEventResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            AuditEventResponse(
                id=item.id,
                action=item.action,
                detail=json_load(item.detail_json, {}),
                actor_user_id=item.actor_user_id,
                contract_id=item.contract_id,
                verification_case_id=item.verification_case_id,
                created_at=item.created_at,
            )
            for item in service.list_audit_events(organization_id, user, limit)
        ]

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/notifications",
        response_model=list[NotificationResponse],
        tags=["notifications"],
    )
    def list_notifications(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
        unread_only: bool = False,
        limit: int = 30,
    ) -> list[NotificationResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.notification_response(item)
            for item in service.list_notifications(organization_id, user, unread_only, limit)
        ]

    @application.patch(
        f"{prefix}/organizations/{{organization_id}}/notifications/{{notification_id}}/read",
        response_model=NotificationResponse,
        tags=["notifications"],
    )
    def mark_notification_read(
        organization_id: str,
        notification_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> NotificationResponse:
        user = service.ensure_user(resolve_principal(request))
        notification = service.mark_notification_read(organization_id, notification_id, user)
        return service.notification_response(notification)

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/notifications/read-all",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["notifications"],
    )
    def mark_all_notifications_read(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> Response:
        user = service.ensure_user(resolve_principal(request))
        service.mark_all_notifications_read(organization_id, user)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/lifecycle",
        response_model=list[LifecycleItemResponse],
        tags=["lifecycle"],
    )
    def list_lifecycle_items(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
        contract_id: str | None = None,
        lifecycle_status: str | None = None,
    ) -> list[LifecycleItemResponse]:
        user = service.ensure_user(resolve_principal(request))
        return [
            service.lifecycle_response(item)
            for item in service.list_lifecycle_items(
                organization_id,
                user,
                contract_id=contract_id,
                status=lifecycle_status,
            )
        ]

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/contracts/{{contract_id}}/lifecycle",
        response_model=LifecycleItemResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["lifecycle"],
    )
    def create_lifecycle_item(
        organization_id: str,
        contract_id: str,
        payload: LifecycleItemCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> LifecycleItemResponse:
        user = service.ensure_user(resolve_principal(request))
        item = service.create_lifecycle_item(
            organization_id,
            contract_id,
            user,
            payload.model_dump(),
        )
        return service.lifecycle_response(item)

    @application.patch(
        f"{prefix}/organizations/{{organization_id}}/lifecycle/{{item_id}}",
        response_model=LifecycleItemResponse,
        tags=["lifecycle"],
    )
    def update_lifecycle_item(
        organization_id: str,
        item_id: str,
        payload: LifecycleItemUpdate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> LifecycleItemResponse:
        user = service.ensure_user(resolve_principal(request))
        item = service.update_lifecycle_item(
            organization_id,
            item_id,
            user,
            payload.model_dump(exclude_unset=True),
        )
        return service.lifecycle_response(item)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/calendar.ics",
        tags=["lifecycle"],
    )
    def export_calendar(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> Response:
        user = service.ensure_user(resolve_principal(request))
        return Response(
            content=service.calendar_ics(organization_id, user),
            media_type="text/calendar; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="lenslayer-calendar.ics"'},
        )

    @application.post(
        f"{prefix}/organizations/{{organization_id}}/portfolio/questions",
        response_model=PortfolioQuestionResponse,
        tags=["portfolio"],
    )
    def answer_portfolio_question(
        organization_id: str,
        payload: PortfolioQuestionCreate,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
    ) -> PortfolioQuestionResponse:
        user = service.ensure_user(resolve_principal(request))
        return service.portfolio_question(organization_id, user, payload.question)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/reports/overview",
        response_model=ReportOverviewResponse,
        tags=["reports"],
    )
    def report_overview(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
        range: ReportRangeName = "30d",
    ) -> ReportOverviewResponse:
        user = service.ensure_user(resolve_principal(request))
        return service.report_overview(organization_id, user, range)

    @application.get(
        f"{prefix}/organizations/{{organization_id}}/reports/export",
        tags=["reports"],
    )
    def export_report(
        organization_id: str,
        request: Request,
        service: Annotated[PlatformService, Depends(get_platform_service)],
        range: ReportRangeName = "30d",
    ) -> Response:
        user = service.ensure_user(resolve_principal(request))
        report = service.report_overview(organization_id, user, range)
        filename = f"lenslayer-report-{range}-{report.generated_at.date().isoformat()}.csv"
        return Response(
            content=service.report_csv(report),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return application


app = create_app()
