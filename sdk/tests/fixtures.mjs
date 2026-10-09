export const token = "ll_agent_unit_test_only";
export const runInput = {
  idempotency_key: "stable-run-key", goal: "Create a renewal follow-up", contract_ids: ["contract-1"],
  allowed_tools: ["documents.retrieve", "workspace.tasks.create"], max_actions: 1, deadline_at: "2099-11-01T00:00:00Z",
  success_condition: { type: "workspace_task_created", contract_id: "contract-1", assigned_to_user_id: "user-1", due_at: "2099-10-30T09:00:00Z" },
};
export const run = {
  ...runInput, id: "run-1", organization_id: "org-1", agent_id: "agent-1", execution_owner: "external_agent",
  status: "running", result: {}, error_code: "", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", completed_at: null,
};
export const actionInput = {
  idempotency_key: "stable-action-key", tool: "workspace.tasks.create",
  input: { contract_id: "contract-1", assigned_to_user_id: "user-1", title: "Review renewal notice", description: "Confirm whether to renew", due_at: "2099-10-30T09:00:00Z", evidence_id: "evidence-1" },
};
export const event = (sequence) => ({ id: `event-${sequence}`, run_id: run.id, sequence, type: "test.event", data: {}, created_at: "2026-10-01T00:00:00Z" });
