"""Explicit collaboration contracts between LensLayer product domains."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


class WorkspaceAccess(Protocol):
    def membership(self, organization_id: str, user: Any) -> Any: ...
    def require_roles(
        self,
        organization_id: str,
        user: Any,
        allowed: set[str],
        detail: str,
    ) -> Any: ...


class ContractAccess(Protocol):
    def get_contract(self, organization_id: str, contract_id: str, user: Any) -> Any: ...
    def get_review(self, organization_id: str, contract_id: str, user: Any) -> Any: ...
    def create_contract(self, *args: Any, **kwargs: Any) -> Any: ...


class TaskAccess(Protocol):
    def list_tasks(self, organization_id: str, user: Any, **filters: Any) -> list[Any]: ...
    def _task_assignee(self, organization_id: str, assignee_user_id: str | None) -> Any: ...


class CollaborationAccess(Protocol):
    def list_contract_decisions(self, organization_id: str, contract_id: str, user: Any) -> list[Any]: ...
    def list_approval_requests(self, organization_id: str, contract_id: str, user: Any) -> list[Any]: ...


class IntegrationAccess(Protocol):
    def _enqueue_webhooks(
        self,
        organization_id: str,
        event_type: str,
        contract_id: str | None,
        payload: dict[str, Any],
    ) -> None: ...


@dataclass(frozen=True)
class DomainDependencies:
    """Optional substitutes for domain-to-domain collaboration in focused tests."""

    workspace: WorkspaceAccess | None = None
    contracts: ContractAccess | None = None
    tasks: TaskAccess | None = None
    collaboration: CollaborationAccess | None = None
    integrations: IntegrationAccess | None = None
