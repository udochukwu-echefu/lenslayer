import type { Agent, AgentAction, AgentRun, EvidenceReceipt, InputRequest, RunEvent } from "./agent-types";
import { ApiError } from "./api/client";
import { DEMO_WORKSPACE_ID } from "./workspace-mode";
import { demoLifecycle, demoReview, demoVersions } from "./demo-data";

const sourceVersion = demoVersions("demo-msa")[0];
const renewalClause = String(demoReview("demo-msa")!.analysis.risk_assessment![1].quote);
// The fictional retained source contains this excerpt. Its text hash is
// separate from the original file hash on the sample contract version.
const sourceTextSha256 = "8dab1ecd364bbd8faf01837a2e2b427b6cdfde7c928e816768196eb771d1b402";
const createdAt = new Date(Date.parse(sourceVersion.created_at) + 60 * 60_000).toISOString();
const completedAt = new Date(Date.parse(createdAt) + 4 * 60_000).toISOString();
const dueAt = new Date(Date.parse(demoLifecycle.find((item) => item.contract_id === "demo-msa")!.due_at) - 5 * 86_400_000).toISOString();
const approvalExpiresAt = new Date(Date.parse(createdAt) + 60 * 60_000).toISOString();
const deadlineAt = new Date(Date.parse(createdAt) + 86_400_000).toISOString();

export const demoAgent: Agent = {
  id: "synthetic-agent", organization_id: DEMO_WORKSPACE_ID, delegated_by_user_id: "demo-aisha",
  name: "Contract renewal assistant", token_prefix: "Not a credential", allowed_tools: ["documents.retrieve", "workspace.tasks.create"],
  contract_ids: ["demo-msa"], assignee_ids: ["demo-chidi"], require_approval: true,
  max_actions_per_run: 1, status: "active", expires_at: new Date(Date.parse(dueAt) + 30 * 86_400_000).toISOString(), revoked_at: null, created_at: createdAt,
};

export const demoRun: AgentRun = {
  id: "synthetic-run", organization_id: DEMO_WORKSPACE_ID, agent_id: demoAgent.id,
  idempotency_key: "synthetic-follow-up", goal: "Ask Chidi to confirm whether we are renewing Loopback's IT support before the notice deadline.",
  execution_owner: "external_agent", contract_ids: ["demo-msa"], allowed_tools: demoAgent.allowed_tools,
  max_actions: 1, status: "succeeded",
  success_condition: { type: "workspace_task_created", contract_id: "demo-msa", assigned_to_user_id: "demo-chidi", due_at: dueAt },
  result: { type: "workspace_task_created", verified: true, task_id: "synthetic-task", evidence_id: "synthetic-evidence", contract_id: "demo-msa", assigned_to_user_id: "demo-chidi", due_at: dueAt, version_id: sourceVersion.id, verification_method: "database_read_back", verified_at: completedAt },
  error_code: "", deadline_at: deadlineAt, created_at: createdAt,
  updated_at: completedAt, completed_at: completedAt,
};

export const demoAction: AgentAction = {
  id: "synthetic-action", run_id: demoRun.id, idempotency_key: "synthetic-task-create", tool: "workspace.tasks.create", tool_version: "1",
  input: { contract_id: "demo-msa", assigned_to_user_id: "demo-chidi", title: "Confirm the Loopback renewal decision with Aisha", description: "Check whether we want another year of IT support. If we decide to leave, Loopback needs 60 days' written notice. Save the decision with the agreement.", due_at: dueAt, evidence_id: "synthetic-evidence", deadline_basis: null },
  input_sha256: "a".repeat(64), status: "succeeded", attempts: 1, approval_status: "approved",
  approved_by_user_id: "demo-aisha", approval_reason: "Chidi is handling this renewal. The follow-up date gives us time to decide before the notice deadline.", approval_expires_at: approvalExpiresAt,
  result: demoRun.result, error_code: "", created_at: createdAt, updated_at: demoRun.updated_at, completed_at: demoRun.completed_at,
};

export const demoEvents: RunEvent[] = [
  ["run.created", { execution_owner: "external_agent" }],
  ["evidence.retrieved", { evidence_id: "synthetic-evidence", contract_id: "demo-msa", version_id: sourceVersion.id, source_sha256: sourceTextSha256 }],
  ["action.proposed", { action_id: demoAction.id, input_sha256: demoAction.input_sha256, status: "awaiting_approval" }],
  ["action.approved", { action_id: demoAction.id, approved_by_user_id: "demo-aisha" }],
  ["run.succeeded", { task_id: "synthetic-task", verified: true }],
].map(([type, data], index) => ({ id: `synthetic-event-${index + 1}`, run_id: demoRun.id, sequence: index + 1, type: type as string, data: data as Record<string, unknown>, created_at: new Date(Date.parse(createdAt) + index * 60_000).toISOString() }));

export const demoEvidence: EvidenceReceipt = {
  id: "synthetic-evidence", contract_id: "demo-msa", version_id: sourceVersion.id, source_sha256: sourceTextSha256,
  excerpt: renewalClause,
  start_offset: 0, end_offset: renewalClause.length, created_at: createdAt,
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
