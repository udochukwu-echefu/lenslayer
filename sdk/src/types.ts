/** Wire types mirror backend/app/agent_schemas.py, not the proposed future API. */
export type ToolName = "documents.retrieve" | "workspace.tasks.create" | "google_calendar.events.create" | "context.retrieve" | "workspace.context_tasks.create";
export type RunStatus = "running" | "awaiting_approval" | "awaiting_input" | "succeeded" | "failed" | "cancelled";
export type ActionStatus = "queued" | "awaiting_approval" | "running" | "unknown_outcome" | "succeeded" | "failed" | "cancelled";
export type JsonObject = Record<string, unknown>;

export interface AgentCreate {
  name: string;
  allowed_tools: ToolName[];
  contract_ids: string[];
  context_ids?: string[];
  assignee_ids: string[];
  calendar_targets?: CalendarTarget[];
  require_approval?: boolean;
  expires_at: string;
  max_actions_per_run?: number;
}

export interface Agent {
  id: string;
  organization_id: string;
  delegated_by_user_id: string;
  name: string;
  token_prefix: string;
  allowed_tools: ToolName[];
  contract_ids: string[];
  context_ids?: string[];
  assignee_ids: string[];
  calendar_targets?: CalendarTarget[];
  require_approval: boolean;
  max_actions_per_run: number;
  status: "active" | "expired" | "revoked";
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface AgentCreated { agent: Agent; token: string }

export interface TaskSuccessCondition {
  type: "workspace_task_created";
  contract_id: string;
  assigned_to_user_id: string;
  due_at: string;
}

export interface CalendarTarget { connection_id: string; calendar_id: string }
export interface CalendarSuccessCondition extends CalendarTarget {
  type: "calendar_event_created";
  summary: string;
  start_at: string;
  end_at: string;
}
export interface CompositeSuccessCondition {
  type: "all";
  conditions: { id: string; condition: TaskSuccessCondition | CalendarSuccessCondition }[];
}
export type WorkflowSuccessCondition = TaskSuccessCondition | CalendarSuccessCondition | CompositeSuccessCondition;
export type SuccessCondition = WorkflowSuccessCondition | GraphSuccessCondition;
/** Generalized route: POST /agent/workflows, not the unchanged task-only /runs. */
export interface WorkflowCreate extends Omit<RunCreate, "success_condition" | "contract_ids"> {
  contract_ids?: string[];
  calendar_targets?: CalendarTarget[];
  success_condition: WorkflowSuccessCondition;
}

export interface RunCreate {
  idempotency_key: string;
  goal: string;
  contract_ids: string[];
  allowed_tools: ToolName[];
  max_actions?: number;
  deadline_at: string;
  success_condition: TaskSuccessCondition;
}

export interface AgentRun {
  id: string;
  organization_id: string;
  agent_id: string;
  idempotency_key: string;
  goal: string;
  execution_owner: "external_agent" | "lenslayer_hosted_agent";
  contract_ids: string[];
  context_ids?: string[];
  allowed_tools: ToolName[];
  max_actions: number;
  status: RunStatus;
  calendar_targets?: CalendarTarget[];
  success_condition: SuccessCondition;
  result: JsonObject;
  error_code: string;
  deadline_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface EvidenceRequest { contract_id: string; query: string; version_id?: string | null }

export interface EvidenceReceipt {
  id: string;
  contract_id: string;
  version_id: string;
  source_sha256: string;
  excerpt: string;
  start_offset: number;
  end_offset: number;
  created_at: string;
}

export interface DeadlineBasis { renewal_date: string; notice_days: number }

export interface TaskActionInput {
  condition_id?: string | null;
  contract_id: string;
  assigned_to_user_id: string;
  title: string;
  description?: string;
  due_at: string;
  evidence_id: string;
  deadline_basis?: DeadlineBasis | null;
}

export interface CalendarActionInput extends CalendarSuccessCondition {
  condition_id?: string | null;
  description?: string;
  contract_id?: string | null;
  evidence_id?: string | null;
}
export type WorkflowActionCreate = {
  idempotency_key: string; tool_version?: "1";
} & ({ tool: "workspace.tasks.create"; input: TaskActionInput } | { tool: "google_calendar.events.create"; input: CalendarActionInput });

export interface InputField { name: string; type: "text" | "date_time" | "integer" | "boolean"; prompt: string }
export interface InputRequestCreate { idempotency_key: string; reason: string; fields: InputField[]; expires_at: string; responder?: "human" | "agent" }
export interface InputSupply { values: Record<string, string | number | boolean> }
export interface InputRequest {
  id: string; run_id: string; request: InputRequestCreate;
  status: "pending" | "supplied" | "expired";
  values: Record<string, unknown>; supplied_by_user_id: string | null;
  supplied_by_agent_id: string | null; supplied_at: string | null; created_at: string;
}

export interface ActionCreate {
  idempotency_key: string;
  tool: "workspace.tasks.create";
  input: TaskActionInput;
}

export interface ApprovalDecision { decision: "approved" | "rejected"; reason: string }

export interface AgentAction {
  id: string;
  run_id: string;
  idempotency_key: string;
  tool: string;
  tool_version: string;
  input: (TaskActionInput & { description: string; deadline_basis: DeadlineBasis | null }) | (CalendarActionInput & { description: string }) | ContextTaskActionInput;
  input_sha256: string;
  status: ActionStatus;
  attempts: number;
  approval_status: "not_required" | "pending" | "approved" | "rejected";
  approved_by_user_id: string | null;
  approval_reason: string;
  approval_expires_at: string | null;
  result: JsonObject;
  error_code: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface RunEvent {
  id: string;
  run_id: string;
  sequence: number;
  type: string;
  data: JsonObject;
  created_at: string;
}

export interface AgentTool {
  name: ToolName;
  version: string;
  description: string;
  requires_approval: boolean;
  input_schema: JsonObject;
}

export interface RequestOptions { signal?: AbortSignal }
export interface EventOptions extends RequestOptions { afterSequence?: number; limit?: number }

/** Additive bounded-v2 contract, coordination/generalization-interface.md. */
export interface ContextRecordCreate { title: string; text: string; expires_at: string }
export interface ContextVersionCreate { expected_version: number; text: string }
export interface ContextScope { context_ids: string[] }
export interface ContextRecord {
  id: string; organization_id: string; title: string; current_version: number;
  expires_at: string; deleted_at: string | null; created_at: string;
}
export interface ContextVersion {
  id: string; record_id: string; version_number: number; source_sha256: string;
  text: string; created_at: string;
}
export interface ContextSearch extends ContextScope { query: string; max_results?: number }
/** Pre-run planning only: no evidence ID/created_at and never authorizes a write. */
export type ContextSearchHit = Omit<ContextEvidenceReceipt, "id" | "created_at">;
export interface ContextEvidenceReceipt extends Omit<EvidenceReceipt, "contract_id"> { context_id: string }
export interface FactualPredicate { fact: string; value: boolean; equals: boolean }
export interface ContextTaskCondition {
  type: "context_task_created"; context_id: string; assigned_to_user_id: string;
  title: string; description?: string; due_at: string;
}
export interface GraphTask extends Omit<ContextTaskCondition, "type"> { type?: "context_task_created"; query: string }
export interface GraphNodeCreate {
  id: string; depends_on?: string[]; not_before_at?: string | null;
  when?: FactualPredicate | null; task: GraphTask;
}
export interface WorkflowGraphCreate extends ContextScope {
  idempotency_key: string; goal: string; deadline_at: string; nodes: GraphNodeCreate[];
}
export interface GraphSuccessCondition { type: "graph"; nodes: { id: string; condition: ContextTaskCondition }[] }
export interface ContextTaskActionInput extends ContextTaskCondition {
  condition_id: string; evidence_id: string; plan_sha256: string; when?: FactualPredicate | null;
}
export type GraphNodeStatus = "blocked" | "ready" | "completed" | "skipped";
export interface GraphNode { id: string; action_id: string; depends_on: string[]; not_before_at: string; status: GraphNodeStatus }
export interface WorkflowGraph { run_id: string; plan_sha256: string; nodes: GraphNode[] }
export interface ContextTaskReceipt {
  type: "context_task_created"; task_id: string; contract_id: null; context_id: string;
  assigned_to_user_id: string; due_at: string; evidence_id: string; version_id: string;
  plan_sha256: string; node_id: string; verified: true;
  verification_method: "database_read_back"; verified_at: string;
}
export interface GraphResult {
  type: "graph"; verified: boolean;
  completed_nodes: Record<string, { action_id: string; result: ContextTaskReceipt }>;
  skipped_node_ids: string[];
}
export type ContextGraphEventData =
  | { evidence_id: string; context_id: string; version_id: string; source_sha256: string }
  | { plan_sha256: string; node_ids: string[] }
  | { node_id: string; action_id: string }
  | { completed_node_ids: string[]; skipped_node_ids: string[] };
