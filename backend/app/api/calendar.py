from fastapi import APIRouter, BackgroundTasks, Request, Response
from ..agent_wake import queue_agent_worker

from ..schemas import IntegrationConnectionResponse, IntegrationProviderResponse
from ..agent_schemas import CalendarDisconnectResponse, CalendarOAuthStartResponse
from ..service_domains.calendar import CalendarOAuthCallback, CalendarOAuthStart
from .dependencies import ServiceDep, UserDep

router = APIRouter(tags=["calendar"])


@router.get("/organizations/{organization_id}/calendar/provider", response_model=IntegrationProviderResponse)
def provider(organization_id: str, service: ServiceDep, user: UserDep):
    return service.calendar_provider(organization_id, user)


@router.post("/organizations/{organization_id}/calendar/oauth/start", response_model=CalendarOAuthStartResponse)
def start(organization_id: str, payload: CalendarOAuthStart, request: Request, response: Response, service: ServiceDep, user: UserDep):
    response.headers["Cache-Control"] = "no-store"
    return service.start_calendar_oauth(organization_id, user, payload, session_proof=request.headers.get("x-lenslayer-calendar-session"))


@router.get("/organizations/{organization_id}/calendar/oauth/eligibility", response_model=IntegrationProviderResponse)
def oauth_eligibility(organization_id: str, response: Response, service: ServiceDep, user: UserDep):
    response.headers["Cache-Control"] = "no-store"
    return service.calendar_oauth_eligibility(organization_id, user)


@router.post("/organizations/{organization_id}/calendar/oauth/callback", response_model=IntegrationConnectionResponse, status_code=201)
def callback(organization_id: str, payload: CalendarOAuthCallback, request: Request, response: Response, service: ServiceDep, user: UserDep):
    response.headers["Cache-Control"] = "no-store"
    return service.complete_calendar_oauth(organization_id, user, payload, session_proof=request.headers.get("x-lenslayer-calendar-session"))


@router.post("/organizations/{organization_id}/calendar/connections/{connection_id}/disconnect", response_model=CalendarDisconnectResponse)
def disconnect(organization_id: str, connection_id: str, request: Request, background_tasks: BackgroundTasks,
               service: ServiceDep, user: UserDep):
    result = service.disconnect_calendar(organization_id, connection_id, user, session_proof=request.headers.get("x-lenslayer-calendar-session"))
    queue_agent_worker(background_tasks, request, organization_id=organization_id)
    return result
