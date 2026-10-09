import type { Agent, AgentAction, AgentRun, EvidenceReceipt, InputRequest, RunEvent } from "./agent-types";
import { ApiError } from "./api/client";
import { DEMO_WORKSPACE_ID } from "./workspace-mode";

const createdAt = "2026-10-01T09:00:00Z";
const dueAt = "2026-10-30T09:00:00Z";

export const demoAgent: Agent = {
  id: "synthetic-agent", organization_id: DEMO_WORKSPACE_ID, delegated_by_user_id: "demo-owner",
  name: "Renewal follow-up example", token_prefix: "Not a credential", allowed_tools: ["documents.retrieve", "workspace.tasks.create"],
  contract_ids: ["demo-msa"], assignee_ids: ["demo-owner"], require_approval: true,
  max_actions_per_run: 1, status: "active", expires_at: "2026-12-01T00:00:00Z", revoked_at: null, created_at: createdAt,
};

export const demoRun: AgentRun = {
  id: "synthetic-run", organization_id: DEMO_WORKSPACE_ID, agent_id: demoAgent.id,
  idempotency_key: "synthetic-follow-up", goal: "Create an assigned renewal follow-up with clause evidence",
  execution_owner: "external_agent", contract_ids: ["demo-msa"], allowed_tools: demoAgent.allowed_tools,
  max_actions: 1, status: "succeeded",
  success_condition: { type: "workspace_task_created", contract_id: "demo-msa", assigned_to_user_id: "demo-owner", due_at: dueAt },
  result: { type: "workspace_task_created", verified: true, task_id: "synthetic-task", evidence_id: "synthetic-evidence", contract_id: "demo-msa", assigned_to_user_id: "demo-owner", due_at: dueAt, version_id: "synthetic-version", verification_method: "database_read_back", verified_at: "2026-10-01T09:04:00Z" },
  error_code: "", deadline_at: "2026-11-01T00:00:00Z", created_at: createdAt,
  updated_at: "2026-10-01T09:04:00Z", completed_at: "2026-10-01T09:04:00Z",
};

export const demoAction: AgentAction = {
  id: "synthetic-action", run_id: demoRun.id, idempotency_key: "synthetic-task-create", tool: "workspace.tasks.create", tool_version: "1",
  input: { contract_id: "demo-msa", assigned_to_user_id: "demo-owner", title: "Review renewal notice deadline", description: "Confirm whether to renew before sending notice.", due_at: dueAt, evidence_id: "synthetic-evidence", deadline_basis: null },
  input_sha256: "a".repeat(64), status: "succeeded", attempts: 1, approval_status: "approved",
  approved_by_user_id: "demo-owner", approval_reason: "Synthetic approval for this walkthrough only.", approval_expires_at: "2026-10-01T10:00:00Z",
  result: demoRun.result, error_code: "", created_at: createdAt, updated_at: demoRun.updated_at, completed_at: demoRun.completed_at,
};

export const demoEvents: RunEvent[] = [
  ["run.created", { execution_owner: "external_agent" }],
  ["evidence.retrieved", { evidence_id: "synthetic-evidence", contract_id: "demo-msa", version_id: "synthetic-version", source_sha256: "b".repeat(64) }],
  ["action.proposed", { action_id: demoAction.id, input_sha256: demoAction.input_sha256, status: "awaiting_approval" }],
  ["action.approved", { action_id: demoAction.id, approved_by_user_id: "demo-owner" }],
  ["run.succeeded", { task_id: "synthetic-task", verified: true }],
].map(([type, data], index) => ({ id: `synthetic-event-${index + 1}`, run_id: demoRun.id, sequence: index + 1, type: type as string, data: data as Record<string, unknown>, created_at: `2026-10-01T09:0${index}:00Z` }));

export const demoEvidence: EvidenceReceipt = {
  id: "synthetic-evidence", contract_id: "demo-msa", version_id: "synthetic-version", source_sha256: "b".repeat(64),
  excerpt: "Synthetic clause: The Term shall renew automatically unless either party gives not less than 120 days' written notice.",
  start_offset: 0, end_offset: 129, created_at: createdAt,
};

export function demoAgentResponse(path: string): Agent[] | AgentRun[] | AgentRun | AgentAction[] | RunEvent[] | InputRequest[] | EvidenceReceipt {
  const url = new URL(path, "https://synthetic.invalid");
  const base = `/organizations/${DEMO_WORKSPACE_ID}`;
  if (url.pathname === `${base}/agents`) return [demoAgent];
  if (url.pathname === `${base}/agent-runs`) return [demoRun];
  if (url.pathname === `${base}/agent-runs/${demoRun.id}`) return demoRun;
  if (url.pathname === `${base}/agent-runs/${demoRun.id}/actions`) return [demoAction];
  if (url.pathname === `${base}/agent-runs/${demoRun.id}/input-requests`) return [];
  if (url.pathname === `${base}/agent-runs/${demoRun.id}/evidence/${demoEvidence.id}`) return demoEvidence;
  if (url.pathname === `${base}/agent-runs/${demoRun.id}/events`) return demoEvents.filter((item) => item.sequence > Number(url.searchParams.get("after_sequence") ?? 0)).slice(0, Number(url.searchParams.get("limit") ?? 100));
  throw new ApiError("This run is not part of the synthetic demo. Switch to its private workspace to inspect it.", 404);
}
