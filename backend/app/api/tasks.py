from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Response, status

from ..schemas import TaskCreate, TaskResponse, TaskStatusName, TaskUpdate
from .dependencies import ServiceDep, UserDep


router = APIRouter()


@router.get(
    "/organizations/{organization_id}/tasks",
    response_model=list[TaskResponse],
    tags=["tasks"],
)
def list_tasks(
    organization_id: str,
    service: ServiceDep,
    user: UserDep,
    task_status: TaskStatusName | None = None,
    assigned_to_user_id: str | None = None,
    contract_id: str | None = None,
    due_before: datetime | None = None,
    due_after: datetime | None = None,
) -> list[TaskResponse]:
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


@router.post(
    "/organizations/{organization_id}/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["tasks"],
)
def create_task(
    organization_id: str,
    payload: TaskCreate,
    service: ServiceDep,
    user: UserDep,
) -> TaskResponse:
    task = service.create_task(organization_id, user, payload.model_dump())
    return service.task_response(task)


@router.patch(
    "/organizations/{organization_id}/tasks/{task_id}",
    response_model=TaskResponse,
    tags=["tasks"],
)
def update_task(
    organization_id: str,
    task_id: str,
    payload: TaskUpdate,
    service: ServiceDep,
    user: UserDep,
) -> TaskResponse:
    task = service.update_task(
        organization_id,
        task_id,
        user,
        payload.model_dump(exclude_unset=True),
    )
    return service.task_response(task)


@router.delete(
    "/organizations/{organization_id}/tasks/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["tasks"],
)
def delete_task(
    organization_id: str,
    task_id: str,
    service: ServiceDep,
    user: UserDep,
) -> Response:
    service.delete_task(organization_id, task_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
