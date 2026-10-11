"""Separate human administration and agent bearer-token routes."""
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response

from ..agent_models import AgentPrincipal
from ..agent_schemas import (
    AgentActionCreate, AgentActionResponse, AgentCreate, AgentCreatedResponse,
    AgentEventResponse, AgentResponse, AgentRunCreate, AgentRunResponse,
    ApprovalDecision, EvidenceRequest, EvidenceResponse, ToolResponse,
    AgentMetricsResponse, InputRequestCreate, InputRequestResponse, InputSupply, WorkflowActionCreate, WorkflowCreate,
)
from ..review_trigger import queue_review_worker
from .dependencies import ServiceDep, UserDep


router = APIRouter(tags=["agents"])


def get_agent(request: Request, service: ServiceDep) -> AgentPrincipal:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="An agent bearer credential is required.")
    return service.authenticate_agent(token.strip())


AgentDep = Annotated[AgentPrincipal, Depends(get_agent)]
ListLimit = Annotated[int, Query(ge=1, le=100)]
EventLimit = Annotated[int, Query(ge=1, le=200)]
EventCursor = Annotated[int, Query(ge=0)]


@router.get("/organizations/{organization_id}/agents", response_model=list[AgentResponse])
def list_agents(organization_id: str, service: ServiceDep, user: UserDep):
    return [service.agent_response(item) for item in service.list_agents(organization_id, user)]


@router.post("/organizations/{organization_id}/agents", response_model=AgentCreatedResponse, status_code=201)
def create_agent(organization_id: str, payload: AgentCreate, response: Response, service: ServiceDep, user: UserDep):
    response.headers["Cache-Control"] = "no-store"
    return service.create_agent(organization_id, user, payload)


@router.post("/organizations/{organization_id}/agents/{agent_id}/revoke", response_model=AgentResponse)
def revoke_agent(organization_id: str, agent_id: str, service: ServiceDep, user: UserDep):
    return service.agent_response(service.revoke_agent(organization_id, agent_id, user))


@router.get("/organizations/{organization_id}/agent-runs", response_model=list[AgentRunResponse])
def list_workspace_runs(organization_id: str, service: ServiceDep, user: UserDep, limit: ListLimit = 50):
    return [service.agent_run_response(item) for item in service.list_agent_runs(organization_id=organization_id, user=user, limit=limit)]


@router.get("/organizations/{organization_id}/agent-runs/{run_id}", response_model=AgentRunResponse)
def get_workspace_run(organization_id: str, run_id: str, service: ServiceDep, user: UserDep):
    return service.agent_run_response(service.get_agent_run(run_id, organization_id=organization_id, user=user))


@router.get("/organizations/{organization_id}/agent-runs/{run_id}/events", response_model=list[AgentEventResponse])
def workspace_run_events(organization_id: str, run_id: str, service: ServiceDep, user: UserDep,
                         after_sequence: EventCursor = 0, limit: EventLimit = 100):
    run = service.get_agent_run(run_id, organization_id=organization_id, user=user)
    return service.agent_run_events(run, after_sequence, limit)


@router.get("/organizations/{organization_id}/agent-runs/{run_id}/actions", response_model=list[AgentActionResponse])
def workspace_run_actions(organization_id: str, run_id: str, service: ServiceDep, user: UserDep):
    return service.agent_run_actions(service.get_agent_run(run_id, organization_id=organization_id, user=user))


@router.get("/organizations/{organization_id}/agent-runs/{run_id}/evidence/{evidence_id}", response_model=EvidenceResponse)
def workspace_run_evidence(organization_id: str, run_id: str, evidence_id: str, service: ServiceDep, user: UserDep):
    run = service.get_agent_run(run_id, organization_id=organization_id, user=user)
    return service.read_agent_evidence(run, evidence_id)


@router.post("/organizations/{organization_id}/agent-runs/{run_id}/cancel", response_model=AgentRunResponse)
def cancel_workspace_run(organization_id: str, run_id: str, service: ServiceDep, user: UserDep):
    return service.agent_run_response(service.cancel_agent_run(run_id, organization_id=organization_id, user=user))


@router.post("/organizations/{organization_id}/agent-runs/{run_id}/actions/{action_id}/approval", response_model=AgentActionResponse)
def approve_action(organization_id: str, run_id: str, action_id: str, payload: ApprovalDecision,
                   request: Request, background_tasks: BackgroundTasks, service: ServiceDep, user: UserDep):
    action = service.approve_agent_action(organization_id, run_id, action_id, user, payload)
    if action.status == "queued":
        queue_review_worker(background_tasks, request.app.state.settings)
    return service.agent_action_response(action)


@router.post("/agent/workflows", response_model=AgentRunResponse, status_code=201)
def create_workflow(payload: WorkflowCreate, service: ServiceDep, agent: AgentDep):
    return service.agent_run_response(service.create_agent_run(agent, payload))


@router.post("/agent/runs/{run_id}/tool-actions", response_model=AgentActionResponse, status_code=202)
def propose_tool_action(run_id: str, payload: WorkflowActionCreate, request: Request, background_tasks: BackgroundTasks,
                        service: ServiceDep, agent: AgentDep):
    action = service.propose_agent_action(agent, run_id, payload)
    if action.status == "queued":
        queue_review_worker(background_tasks, request.app.state.settings)
    return service.agent_action_response(action)


@router.post("/agent/runs/{run_id}/input-requests", response_model=InputRequestResponse, status_code=201)
def request_input(run_id: str, payload: InputRequestCreate, service: ServiceDep, agent: AgentDep):
    return service.request_agent_input(agent, run_id, payload)


@router.get("/agent/runs/{run_id}/input-requests", response_model=list[InputRequestResponse])
def list_inputs(run_id: str, service: ServiceDep, agent: AgentDep):
    return service.list_agent_inputs(service.get_agent_run(run_id, agent=agent))


@router.post("/agent/runs/{run_id}/input-requests/{request_id}/supply", response_model=InputRequestResponse)
def supply_input(run_id: str, request_id: str, payload: InputSupply, service: ServiceDep, agent: AgentDep):
    return service.supply_agent_input(run_id, request_id, payload, agent=agent)


@router.get("/organizations/{organization_id}/agent-runs/{run_id}/input-requests", response_model=list[InputRequestResponse])
def workspace_inputs(organization_id: str, run_id: str, service: ServiceDep, user: UserDep):
    return service.list_agent_inputs(service.get_agent_run(run_id, organization_id=organization_id, user=user))


@router.post("/organizations/{organization_id}/agent-runs/{run_id}/input-requests/{request_id}/supply", response_model=InputRequestResponse)
def workspace_supply(organization_id: str, run_id: str, request_id: str, payload: InputSupply, service: ServiceDep, user: UserDep):
    return service.supply_agent_input(run_id, request_id, payload, organization_id=organization_id, user=user)


@router.post("/organizations/{organization_id}/agent-runs/{run_id}/actions/{action_id}/reconcile", response_model=AgentActionResponse, status_code=202)
def reconcile(organization_id: str, run_id: str, action_id: str, request: Request, background_tasks: BackgroundTasks,
              service: ServiceDep, user: UserDep):
    action = service.reconcile_calendar_action(organization_id, run_id, action_id, user)
    queue_review_worker(background_tasks, request.app.state.settings)
    return service.agent_action_response(action)


@router.get("/organizations/{organization_id}/agent-metrics", response_model=AgentMetricsResponse)
def execution_metrics(organization_id: str, service: ServiceDep, user: UserDep):
    from ..agent_metrics import agent_metrics
    return agent_metrics(service, organization_id, user)


@router.get("/agent/tools", response_model=list[ToolResponse])
def agent_tools(service: ServiceDep, agent: AgentDep):
    return service.agent_tools(agent)


@router.get("/agent/runs", response_model=list[AgentRunResponse])
def list_runs(service: ServiceDep, agent: AgentDep, limit: ListLimit = 50):
    return [service.agent_run_response(item) for item in service.list_agent_runs(agent=agent, limit=limit)]


@router.post("/agent/runs", response_model=AgentRunResponse, status_code=201)
def create_run(payload: AgentRunCreate, service: ServiceDep, agent: AgentDep):
    return service.agent_run_response(service.create_agent_run(agent, payload))


@router.get("/agent/runs/{run_id}", response_model=AgentRunResponse)
def get_run(run_id: str, service: ServiceDep, agent: AgentDep):
    return service.agent_run_response(service.get_agent_run(run_id, agent=agent))


@router.get("/agent/runs/{run_id}/events", response_model=list[AgentEventResponse])
def run_events(run_id: str, service: ServiceDep, agent: AgentDep,
               after_sequence: EventCursor = 0, limit: EventLimit = 100):
    return service.agent_run_events(service.get_agent_run(run_id, agent=agent), after_sequence, limit)


@router.get("/agent/runs/{run_id}/actions", response_model=list[AgentActionResponse])
def run_actions(run_id: str, service: ServiceDep, agent: AgentDep):
    return service.agent_run_actions(service.get_agent_run(run_id, agent=agent))


@router.post("/agent/runs/{run_id}/cancel", response_model=AgentRunResponse)
def cancel_run(run_id: str, service: ServiceDep, agent: AgentDep):
    return service.agent_run_response(service.cancel_agent_run(run_id, agent=agent))


@router.post("/agent/runs/{run_id}/evidence", response_model=EvidenceResponse)
def retrieve_evidence(run_id: str, payload: EvidenceRequest, service: ServiceDep, agent: AgentDep):
    return service.retrieve_agent_evidence(agent, run_id, payload)


@router.get("/agent/runs/{run_id}/evidence/{evidence_id}", response_model=EvidenceResponse)
def read_evidence(run_id: str, evidence_id: str, service: ServiceDep, agent: AgentDep):
    return service.read_agent_evidence(service.get_agent_run(run_id, agent=agent), evidence_id)


@router.post("/agent/runs/{run_id}/actions", response_model=AgentActionResponse, status_code=202)
def propose_action(run_id: str, payload: AgentActionCreate, request: Request, background_tasks: BackgroundTasks,
                   service: ServiceDep, agent: AgentDep):
    action = service.propose_agent_action(agent, run_id, payload)
    if action.status == "queued":
        queue_review_worker(background_tasks, request.app.state.settings)
    return service.agent_action_response(action)
