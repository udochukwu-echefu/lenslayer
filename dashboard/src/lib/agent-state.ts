import type { AgentAction, AgentRun, RunEvent } from "./agent-types";
import type { Role } from "./types";
import { actionMatchesCondition } from "./agent-shapes";

export function isTerminalRun(status: AgentRun["status"]) {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

export function canAdministerAgents(role: Role | null, isDemo: boolean) {
  return !isDemo && (role === "owner" || role === "admin");
}

export function executionOwnerLabel(owner: string) {
  return owner === "lenslayer_hosted_agent" ? "LensLayer hosted agent" : owner === "external_agent" ? "External agent" : "Unknown execution owner";
}

export function canDecideAction(role: Role | null, isDemo: boolean, run: AgentRun, action: AgentAction, now = Date.now()) {
  return canAdministerAgents(role, isDemo) && (run.status === "running" || run.status === "awaiting_approval") && actionMatchesCondition(run, action) && Date.parse(run.deadline_at) > now && action.status === "awaiting_approval" && action.approval_status === "pending" && action.approval_expires_at !== null && Date.parse(action.approval_expires_at) > now;
}

export function runPollInterval(run: AgentRun | undefined, isDemo: boolean, now = Date.now()): number | false {
  return !isDemo && run && !isTerminalRun(run.status) && Date.parse(run.deadline_at) > now ? 5000 : false;
}

export function orderedEvents(pages: RunEvent[][]): RunEvent[] {
  const events = new Map<number, RunEvent>();
  for (const page of pages) for (const event of page) events.set(event.sequence, event);
  return [...events.values()].sort((a, b) => a.sequence - b.sequence);
}

const errorNotes: Record<string, string> = {
  agent_inactive: "The credential expired, was revoked, or lost its delegating administrator. New work is blocked; completed effects remain recorded.",
  delegation_denied: "The agent or approver no longer has permission for this exact action. No further dispatch is authorized.",
  source_unavailable: "The scoped source is no longer available. The run cannot claim a source-backed completion.",
  evidence_or_policy_expired: "Evidence, approval, or another dispatch policy check is no longer valid. Inspect the events and action before retrying.",
  invalid_action: "The action no longer satisfies the tool schema or exact success condition.",
  retry_limit_exceeded: "The worker exhausted its bounded dispatch attempts. Inspect the action result before creating another run.",
  run_finished: "The run finished before this action could be dispatched. Inspect the final result for completed effects.",
  approval_rejected: "A workspace administrator rejected this exact task proposal. No new task will be dispatched for it.",
  approval_expired: "The approval window expired. Inspect any recorded effects before proposing a new action.",
  agent_revoked: "The agent credential was revoked. New work is blocked; completed tasks are not rolled back.",
  deadline_exceeded: "The run deadline elapsed. Inspect action results for any work already completed.",
  cancelled_by_operator: "A workspace administrator cancelled the run. Completed tasks are not deleted.",
  cancelled_by_agent: "The external agent cancelled the run. Completed tasks are not deleted.",
  action_failed: "Task execution failed. Inspect the action result and attempts before retrying with unchanged input.",
  unknown_outcome: "A remote event may exist. Do not submit another write or infer rollback. An owner/admin can request bounded GET-only reconciliation; the terminal run is not reopened.",
  input_expired: "The factual input wait expired. The original deadline, conditions and delegation were not changed.",
  provider_event_conflict: "A conflicting provider object cannot be overwritten or treated as completion. Inspect the immutable input and receipt.",
  model_outcome_unknown: "The optional model call was charged but its outcome could not be recovered. It is not automatically called again. Inspect the assignment and run before starting new work.",
  plan_declined: "The bounded plan was declined. Factual confirmation is separate from action approval and cannot change the fixed assignment facts.",
};

export function agentErrorNote(code: string) {
  return errorNotes[code] ?? "LensLayer did not verify completion. Inspect the action result and ordered events; do not assume that no side effects occurred.";
}

export function exactDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : `${date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;
}
