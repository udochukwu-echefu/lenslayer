import { z } from "zod";
import type { Contract, IntegrationConnection } from "./types";
import type { HostedAgentTask, HostedGoalType, HostedPlannerMode } from "./hosted-agent-types";

export const goalLabels: Record<HostedGoalType, string> = {
  "retained-document-follow-up": "Document follow-up task",
  "calendar-event": "Calendar event",
  "follow-up-and-calendar": "Follow-up task and calendar event",
};
export const plannerLabels: Record<HostedPlannerMode, string> = {
  deterministic: "Fixed workflow · no model",
  model: "Model-assisted · GPT-6.1 Sol, high effort",
};
export const statusNotes: Record<HostedAgentTask["status"], string> = {
  queued: "Assignment recorded. No action has executed yet.",
  planning: "Preparing exact scoped proposals. Planning is not completion.",
  awaiting_input: "Waiting for factual input. Inspect the run; facts do not grant approval.",
  awaiting_approval: "Human decision required. Open the run to inspect and approve exact input.",
  running: "Work is in progress. Only a matching verified run receipt proves completion.",
  succeeded: "The server reports matching verified run completion. Inspect its exact receipts; this does not perform the follow-up.",
  failed: "Completion was not verified. Inspect errors and the run for partial or uncertain effects before assigning again.",
  cancelled: "New work is stopped. Completed or uncertain remote effects are not rolled back.",
};
export const isTerminalHostedTask = (status: string) => ["succeeded", "failed", "cancelled"].includes(status);
export function hostedTaskPollInterval(tasks: HostedAgentTask[] | undefined, now = Date.now()): number | false {
  return tasks?.some((task) => !isTerminalHostedTask(task.status) && Date.parse(task.deadline_at) > now) ? 5000 : false;
}
export function retainedContract(contract: Contract, now = Date.now()) {
  return contract.retain_source_text && (contract.expires_at === null || Date.parse(contract.expires_at) > now);
}
export function calendarGrants(connections: IntegrationConnection[], org: string) {
  return connections.filter((connection) => connection.organization_id === org && connection.provider === "google_calendar" && connection.status === "active" && connection.capabilities.includes("google_calendar.events.create") && connection.settings.credential_mode === "encrypted").flatMap((connection) => {
    const ids = Array.isArray(connection.settings.calendar_ids) ? connection.settings.calendar_ids : [];
    return [...new Set(ids)].filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 1024 && !/[\s*]/.test(id)).map((calendarId) => ({ connection, calendarId, value: JSON.stringify([connection.id, calendarId]) }));
  });
}
/** Text controls require the caller to supply an aware instant, never local-zone inference. */
export function explicitInstant(value: string, label: string): string {
  if (!z.iso.datetime({ offset: true }).safeParse(value.trim()).success) throw new Error(`${label} needs an ISO date and time with Z or an explicit ±HH:MM offset.`);
  return new Date(value.trim()).toISOString();
}
