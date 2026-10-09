import { isTerminalRun } from "../../sdk/dist/index.js";

/** A deterministic protocol example, not a hosted planner or legal interpreter. */
export async function createRenewalFollowUp(client, config, { signal, log = console.log } = {}) {
  const run = await client.createRun({
    idempotency_key: config.runKey,
    goal: "Create an assigned renewal follow-up with clause evidence",
    contract_ids: [config.contractId], allowed_tools: ["documents.retrieve", "workspace.tasks.create"], max_actions: 1,
    deadline_at: config.deadlineAt,
    success_condition: { type: "workspace_task_created", contract_id: config.contractId, assigned_to_user_id: config.assigneeId, due_at: config.dueAt },
  }, { signal });
  log(`Run ${run.id}: ${run.status}. Human review: ${config.dashboardUrl}/runs/${encodeURIComponent(run.id)}`);
  if (isTerminalRun(run.status)) return reportOutcome(run, log);

  // On restart, reuse the existing proposal's receipt instead of retrieving a
  // new receipt that would change the input bound to the action idempotency key.
  const actions = await client.actions(run.id, { signal });
  let action = actions.find((item) => item.idempotency_key === config.actionKey);
  const expectedInput = {
    contract_id: config.contractId, assigned_to_user_id: config.assigneeId, title: "Review renewal notice deadline",
    description: "Confirm whether to renew before sending notice. This task does not send notice or resolve the renewal.",
    due_at: config.dueAt, deadline_basis: config.deadlineBasis ?? null,
  };
  if (action) assertSameProposal(action.input, expectedInput);
  else {
    const receipt = await client.retrieveEvidence(run.id, { contract_id: config.contractId, query: config.query, ...(config.versionId ? { version_id: config.versionId } : {}) }, { signal });
    log(`Retrieved evidence receipt ${receipt.id} from version ${receipt.version_id}. Source identity is not independent validation of legal interpretation.`);
    action = await client.proposeAction(run.id, {
      idempotency_key: config.actionKey, tool: "workspace.tasks.create", input: { ...expectedInput, evidence_id: receipt.id },
    }, { signal });
  }
  log(`Action ${action.id}: ${action.status}.`);
  if (action.status === "awaiting_approval") log("A workspace owner/admin must open the run in the dashboard, inspect the immutable input and evidence, and approve or reject it with a reason. The agent cannot approve itself.");
  let previous = run.status;
  const final = await client.pollRun(run.id, {
    signal, timeoutMs: config.timeoutMs, deadlineAt: run.deadline_at,
    onUpdate: (record) => { if (record.status !== previous) { log(`Run ${record.id}: ${record.status}.`); previous = record.status; } },
  });
  return reportOutcome(final, log);
}

function assertSameProposal(actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (key === "deadline_basis") {
      if ((actual.deadline_basis?.renewal_date ?? null) !== (value?.renewal_date ?? null) || (actual.deadline_basis?.notice_days ?? null) !== (value?.notice_days ?? null)) throw new Error("The existing proposal binds different date assumptions. Inspect it; do not retry with changed input.");
    } else if (key === "due_at") {
      if (Date.parse(actual.due_at) !== Date.parse(value)) throw new Error("The existing proposal binds a different due instant.");
    } else if (actual[key] !== value) throw new Error("The existing action key binds different task input. Inspect the recorded proposal instead of changing its input.");
  }
}

function reportOutcome(run, log) {
  if (run.status === "succeeded" && run.result.verified === true) log(`Verified outcome: follow-up task created (${run.result.task_id}). The renewal itself is not handled.`);
  else log(`No verified completion. Run ${run.id}: ${run.status}; code: ${run.error_code || "not supplied"}. Inspect action results for any effects.`);
  return run;
}
