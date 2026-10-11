import { createHash } from "node:crypto";
import { LensLayerClient, isTerminalRun, type AgentRun, type EvidenceReceipt } from "@lenslayer/agent-sdk";
import { z } from "zod";
import { configSchema, checkpointSchema, planSchema, type Checkpoint, type CheckpointStore, type Planner } from "./contracts.js";

const title = "Review retained-document follow-up";
const description = "Review the retained source and confirm the follow-up. This task does not send notice or perform the follow-up.";
export type RunnerResult = { state: string; code?: string; fields?: string[]; runId?: string; actionId?: string; taskId?: string };

export async function runFollowUp(client: LensLayerClient, planner: Planner, store: CheckpointStore, rawConfig: unknown, parentSignal?: AbortSignal): Promise<RunnerResult> {
  const config = configSchema.parse(rawConfig);
  if (config.goal !== "retained-document-follow-up") return { state: "unsupported", code: "unsupported_goal" };
  const missing = ["contractId", "assigneeId", "dueAt", "deadlineAt"].filter((field) => !config[field as keyof typeof config]);
  if ((config.renewalDate === undefined) !== (config.noticeDays === undefined)) missing.push(config.renewalDate === undefined ? "renewalDate" : "noticeDays");
  if (missing.length) return { state: "awaiting_input", fields: missing }; // local state; no invented v1 awaiting_input route.
  const { contractId, assigneeId, dueAt, deadlineAt } = config as typeof config & { contractId: string; assigneeId: string; dueAt: string; deadlineAt: string };
  if (config.renewalDate) {
    const computed = new Date(Date.parse(`${config.renewalDate}T00:00:00Z`) - config.noticeDays! * 86400000).toISOString().slice(0, 10);
    if (computed !== new Date(dueAt).toISOString().slice(0, 10)) return { state: "awaiting_input", code: "date_basis_mismatch", fields: ["dueAt", "renewalDate", "noticeDays"] };
  }
  const binding = createHash("sha256").update(JSON.stringify(config)).digest("hex");
  let cp: Checkpoint = (await store.load()) ?? checkpointSchema.parse({ version: 1, binding });
  if (cp.binding !== binding) return { state: "stopped", code: "checkpoint_config_conflict" };
  const signal = parentSignal ? AbortSignal.any([parentSignal, AbortSignal.timeout(config.limits.timeMs)]) : AbortSignal.timeout(config.limits.timeMs);
  const save = async (patch: Partial<Checkpoint>) => { cp = checkpointSchema.parse({ ...cp, ...patch }); await store.save(cp); };
  const result = (state: string, code?: string): RunnerResult => ({ state, ...(code ? { code } : {}), ...(cp.runId ? { runId: cp.runId } : {}), ...(cp.actionId ? { actionId: cp.actionId } : {}) });
  const stop = async (code: string) => { await save({ phase: "stopped" }); return result("stopped", code); };
  try {
    await save({});
    // Persist original intent/binding before network; replay always uses original keys.
    let run: AgentRun = cp.runId ? await client.getRun(cp.runId, { signal }) : await client.createRun({
      idempotency_key: config.runKey, goal: "Create one assigned retained-document follow-up task",
      contract_ids: [contractId], allowed_tools: ["documents.retrieve", "workspace.tasks.create"], max_actions: 1,
      deadline_at: deadlineAt, success_condition: { type: "workspace_task_created", contract_id: contractId, assigned_to_user_id: assigneeId, due_at: dueAt },
    }, { signal });
    if (run.idempotency_key !== config.runKey || run.success_condition.type !== "workspace_task_created" || run.success_condition.contract_id !== contractId || run.success_condition.assigned_to_user_id !== assigneeId || Date.parse(run.success_condition.due_at) !== Date.parse(dueAt)) return stop("run_constraint_mismatch");
    await save({ runId: run.id });
    const terminal = async (record: AgentRun) => {
      if (record.status === "succeeded") {
        const r = record.result;
        if (r.type !== "workspace_task_created" || r.verified !== true || r.verification_method !== "database_read_back" || typeof r.task_id !== "string" || r.contract_id !== contractId || r.assigned_to_user_id !== assigneeId || Date.parse(String(r.due_at)) !== Date.parse(dueAt) || (cp.evidenceId && r.evidence_id !== cp.evidenceId)) return stop("unverified_result");
      }
      await save({ phase: record.status as Checkpoint["phase"] });
      return { ...result(record.status), ...(record.status === "succeeded" ? { taskId: String(record.result.task_id) } : {}) };
    };
    if (isTerminalRun(run.status)) return terminal(run);
    if (run.status === "awaiting_input") return result("awaiting_input", "server_input_required");
    const actions = await client.actions(run.id, { signal });
    const action = actions.find((a) => a.idempotency_key === config.actionKey);
    if (action) {
      const a = action.input;
      if (action.tool !== "workspace.tasks.create" || !("assigned_to_user_id" in a) || a.contract_id !== contractId || a.assigned_to_user_id !== assigneeId || Date.parse(a.due_at) !== Date.parse(dueAt) || a.title !== title || a.description !== description || (cp.evidenceId && a.evidence_id !== cp.evidenceId)) return stop("original_action_mismatch");
      await save({ actionId: action.id, evidenceId: a.evidence_id, proposalReady: true, phase: action.status === "awaiting_approval" ? "awaiting_approval" : "queued" });
      return result(cp.phase); // never self-approve, never replan an accepted proposal.
    }
    if (cp.actionId || actions.length) return stop("unexpected_action_ledger");
    if (cp.phase === "stopped") return result("stopped", "manual_review_required");
    if (!cp.planningExpiresAt) await save({ planningExpiresAt: Date.now() + config.limits.timeMs });
    if (Date.now() >= cp.planningExpiresAt!) return stop("time_budget_exhausted");
    const planningSignal = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, cp.planningExpiresAt! - Date.now()))]);
    const grants = await client.tools({ signal: planningSignal });
    if (!["documents.retrieve", "workspace.tasks.create"].every((name) => grants.some((t) => t.name === name && t.version === "1"))) return stop("tool_scope_denied");
    if (!config.limits.actions) return stop("action_budget_exhausted");
    let evidence: EvidenceReceipt;
    if (cp.evidenceId) evidence = await client.readEvidence(run.id, cp.evidenceId, { signal: planningSignal });
    else {
      if (cp.evidenceStarted) return stop("uncertain_evidence_receipt"); // v1 has no receipt listing/idempotency; don't create another on ambiguous restart.
      if (!config.limits.evidence) return stop("evidence_budget_exhausted");
      await save({ evidenceStarted: true, phase: "planning" });
      evidence = await client.retrieveEvidence(run.id, { contract_id: contractId, query: config.query, ...(config.versionId ? { version_id: config.versionId } : {}) }, { signal: planningSignal });
      await save({ evidenceId: z.string().min(1).max(64).parse(evidence.id) });
    }
    if (evidence.contract_id !== contractId || (config.versionId && evidence.version_id !== config.versionId) || !/^[a-f0-9]{64}$/.test(evidence.source_sha256) || typeof evidence.excerpt !== "string" || evidence.excerpt.length > 16000 || !evidence.excerpt.toLowerCase().includes(config.query.toLowerCase())) return stop("invalid_evidence");
    if (!cp.proposalReady) {
      if (cp.modelCalls >= config.limits.modelCalls) return stop("model_budget_exhausted");
      await save({ modelCalls: cp.modelCalls + 1 }); // durable charge before even an ambiguous failed call.
      let raw: unknown;
      try { raw = await withinSignal(planner.plan({ goal: "retained-document-follow-up", facts: { contract_id: contractId, assigned_to_user_id: assigneeId, due_at: dueAt, evidence_id: evidence.id }, query: config.query, untrustedSource: { excerpt: evidence.excerpt, version_id: evidence.version_id, source_sha256: evidence.source_sha256 } }, planningSignal), planningSignal); }
      catch { return stop(planningSignal.aborted ? "time_budget_exhausted" : "model_failed"); }
      if (Buffer.byteLength(JSON.stringify(raw) ?? "") > config.limits.outputBytes) return stop("planner_output_limit");
      const parsed = planSchema.safeParse(raw);
      if (!parsed.success) return stop("invalid_planner_output");
      const plan = parsed.data;
      if (plan.decision === "needs_input") { await save({ phase: "awaiting_input" }); return { ...result("awaiting_input"), fields: plan.missing.length ? plan.missing : ["source_context"] }; }
      if (plan.decision !== "task") return stop("unsupported_plan");
      if (plan.missing.length || plan.contract_id !== contractId || plan.assigned_to_user_id !== assigneeId || plan.due_at !== dueAt || plan.evidence_id !== evidence.id || plan.quote_start === null || plan.quote_end === null || plan.quote_end <= plan.quote_start || plan.quote_end > evidence.excerpt.length || !evidence.excerpt.slice(plan.quote_start, plan.quote_end).toLowerCase().includes(config.query.toLowerCase())) return stop("proposal_constraint_mismatch");
      await save({ proposalReady: true }); // fixed typed input can be rebuilt without storing source/model text.
    }
    planningSignal.throwIfAborted();
    const proposed = await client.proposeAction(run.id, {
      idempotency_key: config.actionKey, tool: "workspace.tasks.create", input: {
        contract_id: contractId, assigned_to_user_id: assigneeId, due_at: dueAt, evidence_id: evidence.id, title, description,
        deadline_basis: config.renewalDate ? { renewal_date: config.renewalDate, notice_days: config.noticeDays! } : null,
      },
    }, { signal: planningSignal });
    await save({ actionId: proposed.id, phase: proposed.status === "awaiting_approval" ? "awaiting_approval" : "queued" });
    run = await client.getRun(run.id, { signal });
    return isTerminalRun(run.status) ? terminal(run) : result(cp.phase);
  } catch { return result("stopped", signal.aborted ? "time_budget_exhausted" : "api_or_checkpoint_failed"); }
}

async function withinSignal<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort!: () => void;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { abort = () => reject(new Error("aborted")); signal.addEventListener("abort", abort, { once: true }); })]); }
  finally { signal.removeEventListener("abort", abort); }
}
