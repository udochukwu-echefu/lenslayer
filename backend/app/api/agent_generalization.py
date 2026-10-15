"""Additive private context and immutable graph HTTP adapters."""
from fastapi import APIRouter, BackgroundTasks, Request, Response

from ..agent_generalization_schemas import (
    ContextEvidenceResponse, ContextRecordCreate, ContextRecordResponse, ContextScope,
    ContextSearch, ContextSearchHit, ContextVersionCreate, ContextVersionResponse, GraphResponse, WorkflowGraphCreate,
)
from ..agent_schemas import AgentResponse, AgentRunResponse
from ..agent_wake import queue_agent_worker
from .agents import AgentDep, ListLimit
from .dependencies import ServiceDep, UserDep

router = APIRouter(tags=["agent context and graphs"])


@router.post("/organizations/{organization_id}/context-records", response_model=ContextRecordResponse, status_code=201)
def create_record(organization_id: str, payload: ContextRecordCreate, request: Request,
                  background_tasks: BackgroundTasks, service: ServiceDep, user: UserDep):
    result = service.create_context_record(organization_id, user, payload)
    queue_agent_worker(background_tasks, request)
    return result


@router.get("/organizations/{organization_id}/context-records", response_model=list[ContextRecordResponse])
def list_records(organization_id: str, service: ServiceDep, user: UserDep, limit: ListLimit = 50):
    return service.list_context_records(organization_id, user, limit)


@router.get("/organizations/{organization_id}/context-records/{context_id}", response_model=ContextRecordResponse)
def get_record(organization_id: str, context_id: str, service: ServiceDep, user: UserDep):
    return service.get_context_record(organization_id, context_id, user)


@router.post("/organizations/{organization_id}/context-records/{context_id}/versions", response_model=ContextRecordResponse, status_code=201)
def append_version(organization_id: str, context_id: str, payload: ContextVersionCreate, request: Request,
                   background_tasks: BackgroundTasks, service: ServiceDep, user: UserDep):
    result = service.create_context_version(organization_id, context_id, user, payload)
    queue_agent_worker(background_tasks, request)
    return result


@router.get("/organizations/{organization_id}/context-records/{context_id}/versions/{version_number}", response_model=ContextVersionResponse)
def get_version(organization_id: str, context_id: str, version_number: int, service: ServiceDep, user: UserDep):
    return service.read_context_version(organization_id, context_id, version_number, user)


@router.delete("/organizations/{organization_id}/context-records/{context_id}", status_code=204)
def delete_record(organization_id: str, context_id: str, request: Request,
                  background_tasks: BackgroundTasks, service: ServiceDep, user: UserDep):
    service.delete_context_record(organization_id, context_id, user)
    queue_agent_worker(background_tasks, request)
    return Response(status_code=204)


@router.post("/organizations/{organization_id}/agents/{agent_id}/context-scope", response_model=AgentResponse)
def narrow_scope(organization_id: str, agent_id: str, payload: ContextScope, request: Request,
                 background_tasks: BackgroundTasks, service: ServiceDep, user: UserDep):
    result = service.narrow_context_scope(organization_id, agent_id, user, payload)
    queue_agent_worker(background_tasks, request, agent_id=agent_id)
    return result


@router.post("/agent/workflow-graphs", response_model=AgentRunResponse, status_code=201)
def create_graph(payload: WorkflowGraphCreate, request: Request, background_tasks: BackgroundTasks,
                 service: ServiceDep, agent: AgentDep):
    run = service.create_workflow_graph(agent, payload)
    result = service.agent_run_response(run)
    queue_agent_worker(background_tasks, request, run_id=run.id, fallback_review=not agent.require_approval)
    return result


@router.post("/agent/context-search", response_model=list[ContextSearchHit])
def delegated_search(payload: ContextSearch, service: ServiceDep, agent: AgentDep):
    return service.search_delegated_context(agent, payload)


@router.get("/agent/runs/{run_id}/graph", response_model=GraphResponse)
def get_graph(run_id: str, service: ServiceDep, agent: AgentDep):
    return service.workflow_graph_response(service.get_agent_run(run_id, agent=agent))


@router.get("/organizations/{organization_id}/agent-runs/{run_id}/graph", response_model=GraphResponse)
def workspace_graph(organization_id: str, run_id: str, service: ServiceDep, user: UserDep):
    return service.workflow_graph_response(service.get_agent_run(run_id, organization_id=organization_id, user=user))


@router.post("/agent/runs/{run_id}/context-evidence", response_model=list[ContextEvidenceResponse])
def search_context(run_id: str, payload: ContextSearch, service: ServiceDep, agent: AgentDep):
    return service.retrieve_context_evidence(agent, run_id, payload)


@router.get("/agent/runs/{run_id}/context-evidence/{evidence_id}", response_model=ContextEvidenceResponse)
def read_context(run_id: str, evidence_id: str, service: ServiceDep, agent: AgentDep):
    return service.read_context_evidence(service.get_agent_run(run_id, agent=agent), evidence_id, agent=agent)


@router.get("/organizations/{organization_id}/agent-runs/{run_id}/context-evidence/{evidence_id}", response_model=ContextEvidenceResponse)
def workspace_evidence(organization_id: str, run_id: str, evidence_id: str, service: ServiceDep, user: UserDep):
    return service.read_context_evidence(service.get_agent_run(run_id, organization_id=organization_id, user=user), evidence_id)
