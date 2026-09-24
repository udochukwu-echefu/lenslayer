from __future__ import annotations

from fastapi import APIRouter, Response, status

from ..schemas import (
    AuditEventResponse,
    ContractActivityResponse,
    NotificationResponse,
    PortfolioQuestionCreate,
    PortfolioQuestionResponse,
    ReportOverviewResponse,
    ReportRangeName,
)
from ..service_domains.common import json_load
from .dependencies import ServiceDep, UserDep


router = APIRouter()


@router.get(
    "/organizations/{organization_id}/contracts/{contract_id}/activity",
    response_model=list[ContractActivityResponse],
    tags=["audit"],
)
def contract_activity(
    organization_id: str,
    contract_id: str,
    service: ServiceDep,
    user: UserDep,
    limit: int = 200,
) -> list[ContractActivityResponse]:
    return service.contract_activity(organization_id, contract_id, user, limit)


@router.get(
    "/organizations/{organization_id}/audit-events",
    response_model=list[AuditEventResponse],
    tags=["audit"],
)
def list_audit_events(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
    limit: int = 100,
) -> list[AuditEventResponse]:
    return [
        AuditEventResponse(
            id=item.id,
            action=item.action,
            detail=json_load(item.detail_json, {}),
            actor_user_id=item.actor_user_id,
            contract_id=item.contract_id,
            created_at=item.created_at,
        )
        for item in service.list_audit_events(organization_id, user, limit)
    ]


@router.get(
    "/organizations/{organization_id}/notifications",
    response_model=list[NotificationResponse],
    tags=["notifications"],
)
def list_notifications(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
    unread_only: bool = False,
    limit: int = 30,
) -> list[NotificationResponse]:
    return [
        service.notification_response(item)
        for item in service.list_notifications(organization_id, user, unread_only, limit)
    ]


@router.patch(
    "/organizations/{organization_id}/notifications/{notification_id}/read",
    response_model=NotificationResponse,
    tags=["notifications"],
)
def mark_notification_read(
    organization_id: str,
    notification_id: str,
    service: ServiceDep,
    user: UserDep,
) -> NotificationResponse:
    notification = service.mark_notification_read(organization_id, notification_id, user)
    return service.notification_response(notification)


@router.post(
    "/organizations/{organization_id}/notifications/read-all",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["notifications"],
)
def mark_all_notifications_read(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
) -> Response:
    service.mark_all_notifications_read(organization_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/organizations/{organization_id}/portfolio/questions",
    response_model=PortfolioQuestionResponse,
    tags=["portfolio"],
)
def answer_portfolio_question(
    organization_id: str,
    payload: PortfolioQuestionCreate,
    service: ServiceDep,
    user: UserDep,
) -> PortfolioQuestionResponse:
    return service.portfolio_question(organization_id, user, payload.question)


@router.get(
    "/organizations/{organization_id}/reports/overview",
    response_model=ReportOverviewResponse,
    tags=["reports"],
)
def report_overview(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
    range: ReportRangeName = "30d",
) -> ReportOverviewResponse:
    return service.report_overview(organization_id, user, range)


@router.get(
    "/organizations/{organization_id}/reports/export",
    tags=["reports"],
)
def export_report(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
    range: ReportRangeName = "30d",
) -> Response:
    report = service.report_overview(organization_id, user, range)
    filename = f"lenslayer-report-{range}-{report.generated_at.date().isoformat()}.csv"
    return Response(
        content=service.report_csv(report),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
