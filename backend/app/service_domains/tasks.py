from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from ..models import Contract, Membership, User, WorkflowTask, utcnow
from ..schemas import TaskResponse
from .common import TASK_SOURCE_KINDS, TASK_STATUSES, json_dump, json_load, normalized_role


class TasksServiceMixin:
    def list_tasks(
        self,
        organization_id: str,
        user: User,
        *,
        status: str | None = None,
        assigned_to_user_id: str | None = None,
        contract_id: str | None = None,
        due_before: datetime | None = None,
        due_after: datetime | None = None,
    ) -> list[WorkflowTask]:
        self.workspace.membership(organization_id, user)
        query = (
            select(WorkflowTask)
            .options(joinedload(WorkflowTask.contract), joinedload(WorkflowTask.assigned_to_user))
            .where(WorkflowTask.organization_id == organization_id)
        )
        if status:
            if status not in TASK_STATUSES:
                raise HTTPException(status_code=422, detail="Unknown task status.")
            query = query.where(WorkflowTask.status == status)
        if assigned_to_user_id:
            query = query.where(WorkflowTask.assigned_to_user_id == assigned_to_user_id)
        if contract_id:
            query = query.where(WorkflowTask.contract_id == contract_id)
        if due_before:
            query = query.where(WorkflowTask.due_at <= due_before)
        if due_after:
            query = query.where(WorkflowTask.due_at >= due_after)
        return list(
            self.session.scalars(
                query.order_by(WorkflowTask.due_at.asc().nulls_last(), WorkflowTask.created_at.desc())
            ).all()
        )

    def get_task(self, organization_id: str, task_id: str, user: User) -> WorkflowTask:
        self.workspace.membership(organization_id, user)
        task = self.session.scalar(
            select(WorkflowTask).where(
                WorkflowTask.id == task_id,
                WorkflowTask.organization_id == organization_id,
            )
        )
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found.")
        return task

    def create_task(self, organization_id: str, user: User, payload: dict[str, Any]) -> WorkflowTask:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin", "reviewer"},
            "Viewers have read-only access and cannot create tasks.",
        )
        contract = self._task_contract(organization_id, payload.get("contract_id"))
        assignee = self._task_assignee(organization_id, payload.get("assigned_to_user_id"))
        source_kind = payload.get("source_kind", "manual")
        if source_kind not in TASK_SOURCE_KINDS:
            raise HTTPException(status_code=422, detail="Unknown task source.")
        task = WorkflowTask(
            organization_id=organization_id,
            contract_id=contract.id if contract else None,
            created_by_user_id=user.id,
            assigned_to_user_id=assignee.id if assignee else None,
            title=payload["title"].strip(),
            description=payload.get("description", "").strip(),
            category=payload.get("category", "follow_up"),
            priority=payload.get("priority", "normal"),
            status=payload.get("status", "open"),
            due_at=payload.get("due_at"),
            source_kind=source_kind,
            source_reference_json=json_dump(payload.get("source_reference", {})),
            completed_at=utcnow() if payload.get("status") == "done" else None,
        )
        self.session.add(task)
        self.session.flush()
        self._audit(
            organization_id,
            user.id,
            "task.created",
            task.contract_id,
            {"task_id": task.id, "title": task.title, "assigned_to_user_id": task.assigned_to_user_id},
        )
        self.session.commit()
        self.session.refresh(task)
        return task

    def update_task(
        self,
        organization_id: str,
        task_id: str,
        user: User,
        changes: dict[str, Any],
    ) -> WorkflowTask:
        self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin", "reviewer"},
            "Viewers have read-only access and cannot change tasks.",
        )
        task = self.get_task(organization_id, task_id, user)
        if "contract_id" in changes:
            contract = self._task_contract(organization_id, changes["contract_id"])
            task.contract_id = contract.id if contract else None
        if "assigned_to_user_id" in changes:
            assignee = self._task_assignee(organization_id, changes["assigned_to_user_id"])
            task.assigned_to_user_id = assignee.id if assignee else None
        for field in ("title", "description", "category", "priority", "due_at"):
            if field in changes:
                value = changes[field]
                if value is None and field != "due_at":
                    continue
                if field in {"title", "description"} and isinstance(value, str):
                    value = value.strip()
                setattr(task, field, value)
        if "status" in changes and changes["status"] is not None:
            task.status = changes["status"]
            task.completed_at = utcnow() if task.status == "done" else None
        self._audit(
            organization_id,
            user.id,
            "task.updated",
            task.contract_id,
            {"task_id": task.id, "changed_fields": sorted(changes)},
        )
        self.session.commit()
        self.session.refresh(task)
        return task

    def delete_task(self, organization_id: str, task_id: str, user: User) -> None:
        membership = self.workspace.require_roles(
            organization_id,
            user,
            {"owner", "admin", "reviewer"},
            "Viewers have read-only access and cannot delete tasks.",
        )
        task = self.get_task(organization_id, task_id, user)
        if normalized_role(membership.role) == "reviewer" and task.created_by_user_id != user.id:
            raise HTTPException(status_code=403, detail="Reviewers can delete only tasks they created.")
        self._audit(
            organization_id,
            user.id,
            "task.deleted",
            task.contract_id,
            {"task_id": task.id, "title": task.title},
        )
        self.session.delete(task)
        self.session.commit()

    def _task_contract(self, organization_id: str, contract_id: str | None) -> Contract | None:
        if not contract_id:
            return None
        contract = self.session.scalar(
            select(Contract).where(
                Contract.id == contract_id,
                Contract.organization_id == organization_id,
            )
        )
        if contract is None:
            raise HTTPException(status_code=422, detail="Choose a contract from this workspace.")
        return contract

    def _task_assignee(self, organization_id: str, user_id: str | None) -> User | None:
        if not user_id:
            return None
        membership = self.session.scalar(
            select(Membership).where(
                Membership.organization_id == organization_id,
                Membership.user_id == user_id,
            )
        )
        if membership is None:
            raise HTTPException(status_code=422, detail="Choose a member of this workspace.")
        return membership.user

    @staticmethod
    def task_response(task: WorkflowTask) -> TaskResponse:
        return TaskResponse(
            id=task.id,
            organization_id=task.organization_id,
            contract_id=task.contract_id,
            contract_title=task.contract.title if task.contract else None,
            created_by_user_id=task.created_by_user_id,
            assigned_to_user_id=task.assigned_to_user_id,
            assigned_to_name=task.assigned_to_user.display_name if task.assigned_to_user else None,
            assigned_to_email=task.assigned_to_user.email if task.assigned_to_user else None,
            title=task.title,
            description=task.description,
            category=task.category,
            priority=task.priority,
            status=task.status,
            due_at=task.due_at,
            source_kind=task.source_kind,
            source_reference=json_load(task.source_reference_json, {}),
            completed_at=task.completed_at,
            created_at=task.created_at,
            updated_at=task.updated_at,
        )
