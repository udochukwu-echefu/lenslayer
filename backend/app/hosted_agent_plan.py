"""Pure fixed-fact planning. Neither source nor model may edit action facts."""
from .agent_schemas import AgentCreate, CalendarActionInput, TaskActionInput, WorkflowActionCreate, WorkflowCreate


def plan_scope(request):
    tools = []
    if request.contract_id:
        tools += ["documents.retrieve", "workspace.tasks.create"]
    if request.calendar:
        tools += ["google_calendar.events.create"]
    targets = [] if not request.calendar else [{"connection_id": request.calendar.connection_id, "calendar_id": request.calendar.calendar_id}]
    return tools, targets


def delegation(request):
    tools, targets = plan_scope(request)
    return AgentCreate(name="LensLayer hosted task", allowed_tools=tools,
        contract_ids=[request.contract_id] if request.contract_id else [],
        assignee_ids=[request.assignee_id] if request.assignee_id else [],
        calendar_targets=targets, require_approval=True, expires_at=request.deadline_at,
        max_actions_per_run=2 if request.goal_type == "follow-up-and-calendar" else 1)


def workflow(request):
    tools, targets = plan_scope(request)
    required = []
    if request.contract_id:
        required.append({"id": "task", "condition": {"type": "workspace_task_created",
            "contract_id": request.contract_id, "assigned_to_user_id": request.assignee_id, "due_at": request.due_at}})
    if request.calendar:
        required.append({"id": "calendar", "condition": request.calendar.model_dump()})
    condition = {"type": "all", "conditions": required} if len(required) == 2 else required[0]["condition"]
    return WorkflowCreate(idempotency_key="hosted-run-v1", goal=request.goal,
        contract_ids=[request.contract_id] if request.contract_id else [], calendar_targets=targets,
        allowed_tools=tools, max_actions=len(required), deadline_at=request.deadline_at, success_condition=condition)


def proposal(request, kind, evidence_id):
    condition_id = kind if request.goal_type == "follow-up-and-calendar" else None
    if kind == "task":
        payload = TaskActionInput(contract_id=request.contract_id, assigned_to_user_id=request.assignee_id,
            due_at=request.due_at, title=request.task_title, description=request.task_description,
            evidence_id=evidence_id, condition_id=condition_id)
        tool = "workspace.tasks.create"
    else:
        payload = CalendarActionInput(**request.calendar.model_dump(), condition_id=condition_id,
            contract_id=request.contract_id, evidence_id=evidence_id if request.contract_id else None)
        tool = "google_calendar.events.create"
    return WorkflowActionCreate(idempotency_key="hosted-" + kind + "-v1", tool=tool, input=payload)
