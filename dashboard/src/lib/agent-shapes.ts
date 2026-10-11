import type { AgentAction, AgentRun, CalendarActionInput, CalendarSuccessCondition, SuccessCondition, TaskActionInput, TaskSuccessCondition } from "./agent-types";

const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const aware = (value: unknown): value is string => text(value) && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value));
export function isTaskCondition(value: unknown): value is TaskSuccessCondition {
  const c = value as Partial<TaskSuccessCondition> | null;
  return Boolean(c && c.type === "workspace_task_created" && text(c.contract_id) && text(c.assigned_to_user_id) && aware(c.due_at));
}
export function isCalendarCondition(value: unknown): value is CalendarSuccessCondition {
  const c = value as Partial<CalendarSuccessCondition> | null;
  return Boolean(c && c.type === "calendar_event_created" && text(c.connection_id) && text(c.calendar_id) && !/[\s*]/.test(c.calendar_id!) && text(c.summary) && aware(c.start_at) && aware(c.end_at) && Date.parse(c.end_at!) > Date.parse(c.start_at!) && Date.parse(c.end_at!) - Date.parse(c.start_at!) <= 31 * 86400000);
}
export function isTaskAction(action: AgentAction): action is AgentAction & { input: TaskActionInput & { description: string } } {
  const input = action.input as TaskActionInput;
  return action.tool === "workspace.tasks.create" && action.tool_version === "1" && isTaskCondition({ ...input, type: "workspace_task_created" }) && text(input.title) && text(input.evidence_id);
}
export function isCalendarAction(action: AgentAction): action is AgentAction & { input: CalendarActionInput & { description: string } } {
  const input = action.input as CalendarActionInput;
  return action.tool === "google_calendar.events.create" && action.tool_version === "1" && isCalendarCondition(input) && Boolean(input.contract_id) === Boolean(input.evidence_id);
}
export function knownCondition(condition: SuccessCondition): boolean {
  return isTaskCondition(condition) || isCalendarCondition(condition) || (condition?.type === "all" && Array.isArray(condition.conditions) && condition.conditions.length > 0 && condition.conditions.length <= 20 && condition.conditions.every((c) => c && text(c.id) && (isTaskCondition(c.condition) || isCalendarCondition(c.condition))) && new Set(condition.conditions.map((c) => c.id)).size === condition.conditions.length);
}
export function actionMatchesCondition(run: AgentRun, action: AgentAction): boolean {
  if (!knownCondition(run.success_condition)) return false;
  const id = action.input?.condition_id;
  const root = run.success_condition;
  const condition = root?.type === "all" ? root.conditions?.find((c) => c.id === id)?.condition : id ? undefined : root;
  if (isTaskAction(action) && isTaskCondition(condition)) return action.input.contract_id === condition.contract_id && action.input.assigned_to_user_id === condition.assigned_to_user_id && Date.parse(action.input.due_at) === Date.parse(condition.due_at);
  if (isCalendarAction(action) && isCalendarCondition(condition)) return action.input.connection_id === condition.connection_id && action.input.calendar_id === condition.calendar_id && action.input.summary === condition.summary && Date.parse(action.input.start_at) === Date.parse(condition.start_at) && Date.parse(action.input.end_at) === Date.parse(condition.end_at);
  return false;
}
