"""Closed, typed/versioned tool registry, not a user-extensible code loader."""
from dataclasses import dataclass
from typing import Any, Callable

from fastapi import HTTPException
from pydantic import BaseModel

from .agent_schemas import CalendarActionInput, EvidenceRequest, TaskActionInput
from .service_domains.common import aware, json_load


def _execute_task(*args):
    from .agent_runtime import process_task_action
    return process_task_action(*args)


def _execute_calendar(*args):
    from .calendar_runtime import process_calendar_action
    return process_calendar_action(*args)


def verify_task(task, condition, payload, reference, organization_id, delegator_id):
    actual = json_load(task.source_reference_json, {})
    return (isinstance(actual, dict) and task.organization_id == organization_id and task.contract_id == condition.contract_id
            and task.assigned_to_user_id == condition.assigned_to_user_id
            and task.due_at is not None and aware(task.due_at) == condition.due_at
            and task.title == payload.title and task.description == payload.description
            and task.created_by_user_id == delegator_id
            and all(actual.get(key) == value for key, value in reference.items()))


def _verify_calendar(actual, expected):
    from .calendar_connector import GoogleCalendarHTTP
    return GoogleCalendarHTTP.verify(actual, expected)


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    version: str
    input_model: type[BaseModel]
    resource_kinds: tuple[str, ...]
    policy_method: str
    execution_adapter: str
    completion_check: str
    description: str
    writes: bool = True
    execute: Callable[..., bool] | None = None
    check_completion: Callable[..., Any] | None = None

    def validate_scope(self, service, agent, run, payload):
        if not isinstance(payload, self.input_model):
            raise HTTPException(422, "Input does not match tool version.")
        return getattr(service, self.policy_method)(agent, run, payload)


TOOLS = {
    ("documents.retrieve", "1"): ToolDefinition(
        "documents.retrieve", "1", EvidenceRequest, ("contract",), "retrieve_agent_evidence",
        "retained_document", "source_hash", "Retrieve retained source evidence.", False),
    ("workspace.tasks.create", "1"): ToolDefinition(
        "workspace.tasks.create", "1", TaskActionInput, ("contract",), "validate_agent_task_input",
        "database_task", "database_read_back", "Create a source-backed assigned workspace task.",
        execute=_execute_task, check_completion=verify_task),
    ("google_calendar.events.create", "1"): ToolDefinition(
        "google_calendar.events.create", "1", CalendarActionInput, ("contract", "calendar"),
        "validate_agent_calendar_input", "google_calendar", "google_events_get",
        "Create a private, single calendar event and independently read it back.",
        execute=_execute_calendar, check_completion=_verify_calendar),
}


def get_tool(name: str, version: str = "1") -> ToolDefinition:
    definition = TOOLS.get((name, version))
    if definition is None:
        raise HTTPException(422, "Unsupported tool version.")
    return definition


def conditions(value: dict) -> dict[str, dict]:
    return {entry["id"]: entry["condition"] for entry in value["conditions"]} if value["type"] == "all" else {"__single__": value}


def selected_condition(run, payload):
    import json
    choices = conditions(json.loads(run.success_condition_json))
    key = payload.condition_id or "__single__"
    if key not in choices:
        raise HTTPException(422, "An exact required condition_id is required for this action.")
    return choices[key]
