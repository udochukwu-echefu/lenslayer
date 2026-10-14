import type { AgentAction, AgentRun, CalendarActionInput, CalendarSuccessCondition, SuccessCondition, TaskActionInput, TaskSuccessCondition } from "./agent-types";
import type { ContextTaskCondition, ContextTaskActionInput, FactualPredicate, WorkflowGraph } from "./agent-types";

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
export function isContextCondition(value: unknown): value is ContextTaskCondition {
  const c = value as Partial<ContextTaskCondition> | null;
  return Boolean(c && c.type === "context_task_created" && text(c.context_id) && text(c.assigned_to_user_id) && text(c.title) && (c.description === undefined || typeof c.description === "string") && aware(c.due_at));
}
export function isFactualPredicate(value: unknown): value is FactualPredicate {
  const p = value as Partial<FactualPredicate> | null;
  return Boolean(p && typeof p.fact === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(p.fact) && typeof p.value === "boolean" && typeof p.equals === "boolean" && Object.keys(p).every((key) => ["fact", "value", "equals"].includes(key)));
}
export function isContextAction(action: AgentAction): action is AgentAction & { input: ContextTaskActionInput } {
  const input = action.input as ContextTaskActionInput;
  return action.tool === "workspace.context_tasks.create" && action.tool_version === "1" && isContextCondition(input) && text(input.condition_id) && text(input.evidence_id) && typeof input.plan_sha256 === "string" && /^[a-f0-9]{64}$/.test(input.plan_sha256) && (input.when == null || isFactualPredicate(input.when));
}
export function isWorkflowGraph(value: unknown): value is WorkflowGraph {
  const graph = value as Partial<WorkflowGraph> | null;
  if (!graph || !text(graph.run_id) || typeof graph.plan_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(graph.plan_sha256) || !Array.isArray(graph.nodes) || graph.nodes.length < 1 || graph.nodes.length > 20) return false;
  if (!graph.nodes.every((node) => node && text(node.id) && text(node.action_id) && aware(node.not_before_at) && ["blocked", "ready", "completed", "skipped"].includes(node.status) && Array.isArray(node.depends_on) && node.depends_on.every(text) && new Set(node.depends_on).size === node.depends_on.length)) return false;
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  if (nodes.size !== graph.nodes.length || new Set(graph.nodes.map((node) => node.action_id)).size !== graph.nodes.length) return false;
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string): boolean {
    if (!nodes.has(id) || visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    if (!nodes.get(id)!.depends_on.every(visit)) return false;
    visiting.delete(id); visited.add(id); return true;
  }
  return graph.nodes.every((node) => visit(node.id));
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
  return isTaskCondition(condition) || isCalendarCondition(condition) || (condition?.type === "all" && Array.isArray(condition.conditions) && condition.conditions.length > 0 && condition.conditions.length <= 20 && condition.conditions.every((c) => c && text(c.id) && (isTaskCondition(c.condition) || isCalendarCondition(c.condition))) && new Set(condition.conditions.map((c) => c.id)).size === condition.conditions.length) || (condition?.type === "graph" && Array.isArray(condition.nodes) && condition.nodes.length >= 1 && condition.nodes.length <= 20 && condition.nodes.every((node) => node && text(node.id) && isContextCondition(node.condition)) && new Set(condition.nodes.map((node) => node.id)).size === condition.nodes.length);
}
export function actionMatchesCondition(run: AgentRun, action: AgentAction): boolean {
  if (!knownCondition(run.success_condition)) return false;
  const id = action.input?.condition_id;
  const root = run.success_condition;
  const condition = root?.type === "graph" ? root.nodes.find((node) => node.id === id)?.condition : root?.type === "all" ? root.conditions?.find((c) => c.id === id)?.condition : id ? undefined : root;
  if (root.type === "graph" && isContextAction(action) && isContextCondition(condition)) return (run.context_ids ?? []).includes(action.input.context_id) && action.input.context_id === condition.context_id && action.input.assigned_to_user_id === condition.assigned_to_user_id && action.input.title === condition.title && (action.input.description ?? "") === (condition.description ?? "") && Date.parse(action.input.due_at) === Date.parse(condition.due_at);
  if (isTaskAction(action) && isTaskCondition(condition)) return action.input.contract_id === condition.contract_id && action.input.assigned_to_user_id === condition.assigned_to_user_id && Date.parse(action.input.due_at) === Date.parse(condition.due_at);
  if (isCalendarAction(action) && isCalendarCondition(condition)) return action.input.connection_id === condition.connection_id && action.input.calendar_id === condition.calendar_id && action.input.summary === condition.summary && Date.parse(action.input.start_at) === Date.parse(condition.start_at) && Date.parse(action.input.end_at) === Date.parse(condition.end_at);
  return false;
}

/** Do not promote a graph's bare verified flag over its original action/receipt bindings. */
export function graphOutcomeVerified(run: AgentRun, graph: WorkflowGraph | undefined, actions: AgentAction[]): boolean {
  if (run.status !== "succeeded" || run.success_condition.type !== "graph" || !knownCondition(run.success_condition) || !isWorkflowGraph(graph) || graph.run_id !== run.id) return false;
  const result = run.result;
  if (result.type !== "graph" || result.verified !== true || !result.completed_nodes || typeof result.completed_nodes !== "object" || Array.isArray(result.completed_nodes) || !Array.isArray(result.skipped_node_ids) || !result.skipped_node_ids.every(text)) return false;
  const completed = result.completed_nodes as Record<string, unknown>, skipped = result.skipped_node_ids as string[];
  const ids = run.success_condition.nodes.map((node) => node.id);
  if (new Set(skipped).size !== skipped.length || graph.nodes.length !== ids.length || graph.nodes.some((node) => !ids.includes(node.id)) || [...Object.keys(completed), ...skipped].length !== ids.length || skipped.some((id) => Object.hasOwn(completed, id)) || [...Object.keys(completed), ...skipped].some((id) => !ids.includes(id))) return false;
  return graph.nodes.every((node) => {
    const action = actions.find((entry) => entry.id === node.action_id);
    if (!action || action.run_id !== run.id || !isContextAction(action) || !actionMatchesCondition(run, action) || action.input.plan_sha256 !== graph.plan_sha256 || action.input.condition_id !== node.id) return false;
    if (skipped.includes(node.id)) return node.status === "skipped" && action.status === "cancelled" && action.error_code === "branch_false" && action.attempts === 0 && action.approval_status === "approved" && Boolean(action.input.when && action.input.when.value !== action.input.when.equals) && action.result.verified !== true;
    const entry = completed[node.id] as { action_id?: unknown; result?: Record<string, unknown> } | null;
    const receipt = entry?.result;
    if (!receipt || entry?.action_id !== action.id || node.status !== "completed" || action.status !== "succeeded") return false;
    return receipt.type === "context_task_created" && receipt.contract_id === null && receipt.verified === true && receipt.verification_method === "database_read_back" && text(receipt.task_id) && text(receipt.version_id) && aware(receipt.verified_at) && receipt.context_id === action.input.context_id && receipt.assigned_to_user_id === action.input.assigned_to_user_id && aware(receipt.due_at) && Date.parse(receipt.due_at) === Date.parse(action.input.due_at) && receipt.evidence_id === action.input.evidence_id && receipt.plan_sha256 === graph.plan_sha256 && receipt.node_id === node.id && Object.keys(receipt).every((key) => action.result[key] === receipt[key]) && !(action.input.when && action.input.when.value !== action.input.when.equals);
  });
}
