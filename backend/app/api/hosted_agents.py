"""Human product endpoints; agent bearer tokens never administer hosted tasks."""
from typing import Annotated

from fastapi import APIRouter, Query, Response

from ..hosted_agent_schemas import HostedCapabilities, HostedTaskCreate, HostedTaskResponse
from ..hosted_agent_service import HostedAgentService
from .dependencies import ServiceDep, UserDep

router = APIRouter(tags=["hosted-agents"])


@router.get("/organizations/{organization_id}/hosted-agent-capabilities", response_model=HostedCapabilities)
def capabilities(organization_id: str, service: ServiceDep, user: UserDep):
    return HostedAgentService(service).capabilities(organization_id, user)


@router.post("/organizations/{organization_id}/hosted-agent-tasks", response_model=HostedTaskResponse, status_code=201)
def create(organization_id: str, payload: HostedTaskCreate, response: Response, service: ServiceDep, user: UserDep):
    response.headers["Cache-Control"] = "no-store"
    hosted = HostedAgentService(service)
    return hosted.response(hosted.create(organization_id, user, payload))


@router.get("/organizations/{organization_id}/hosted-agent-tasks", response_model=list[HostedTaskResponse])
def list_tasks(organization_id: str, service: ServiceDep, user: UserDep, limit: Annotated[int, Query(ge=1, le=100)] = 50):
    hosted = HostedAgentService(service)
    return [hosted.response(task) for task in hosted.list(organization_id, user, limit)]


@router.get("/organizations/{organization_id}/hosted-agent-tasks/{task_id}", response_model=HostedTaskResponse)
def get(organization_id: str, task_id: str, service: ServiceDep, user: UserDep):
    hosted = HostedAgentService(service)
    return hosted.response(hosted.get(organization_id, task_id, user))


@router.post("/organizations/{organization_id}/hosted-agent-tasks/{task_id}/cancel", response_model=HostedTaskResponse)
def cancel(organization_id: str, task_id: str, service: ServiceDep, user: UserDep):
    hosted = HostedAgentService(service)
    return hosted.response(hosted.cancel(organization_id, task_id, user))
