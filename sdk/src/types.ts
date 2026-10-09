/** Wire types mirror backend/app/agent_schemas.py, not the proposed future API. */
export type ToolName = "documents.retrieve" | "workspace.tasks.create" | "google_calendar.events.create";
export type RunStatus = "running" | "awaiting_approval" | "awaiting_input" | "succeeded" | "failed" | "cancelled";
export type ActionStatus = "queued" | "awaiting_approval" | "running" | "unknown_outcome" | "succeeded" | "failed" | "cancelled";
export type JsonObject = Record<string, unknown>;

export interface AgentCreate {
  name: string;
  allowed_tools: ToolName[];
  contract_ids: string[];
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
export type SuccessCondition = TaskSuccessCondition | CalendarSuccessCondition | CompositeSuccessCondition;
/** Generalized route: POST /agent/workflows, not the unchanged task-only /runs. */
export interface WorkflowCreate extends Omit<RunCreate, "success_condition" | "contract_ids"> {
  contract_ids?: string[];
  calendar_targets?: CalendarTarget[];
  success_condition: SuccessCondition;
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
  execution_owner: "external_agent";
  contract_ids: string[];
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
  input: (TaskActionInput & { description: string; deadline_basis: DeadlineBasis | null }) | (CalendarActionInput & { description: string });
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
