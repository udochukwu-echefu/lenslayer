import type { Contract, IntegrationConnection, Membership } from "./types";
import type { HostedAgentCapabilities, HostedAgentTaskCreate, HostedGoalType, HostedPlannerMode } from "./hosted-agent-types";
import { calendarGrants, explicitInstant, retainedContract } from "./hosted-agent-state";

export function assignmentInput(form: FormData, context: {
  organizationId: string; capabilities: HostedAgentCapabilities;
  contracts: Contract[]; members: Membership[]; connections: IntegrationConnection[];
}, key: string): HostedAgentTaskCreate {
  const field = (name: string) => String(form.get(name) ?? "");
  const { capabilities, organizationId } = context;
  const goalType = field("goal_type") as HostedGoalType;
  const mode = field("planner_mode") as HostedPlannerMode;
  if (!capabilities.enabled || !capabilities.goal_types.includes(goalType)) throw new Error("This goal is not enabled by the hosted agent service.");
  if (!capabilities.planner_modes.includes(mode)) throw new Error("This planning mode is not enabled. Refresh capabilities before assigning.");
  if (mode === "model" && form.get("excerpt_consent") !== "on") throw new Error("Acknowledge sharing your goal, scoped facts and any retained excerpt with the product model provider.");
  const goal = field("goal").trim();
  if (!goal || goal.length > 4000) throw new Error("Describe the exact goal in 1–4000 characters.");
  const deadline = explicitInstant(field("deadline_at"), "Execution deadline");
  const days = Math.min(7, capabilities.max_deadline_days);
  if (!Number.isFinite(days) || days <= 0 || Date.parse(deadline) <= Date.now() || Date.parse(deadline) > Date.now() + days * 86400000) throw new Error(`Choose a future execution deadline within ${days} days.`);
  const base = { idempotency_key: key, goal, deadline_at: deadline, planner_mode: mode };
  const document = goalType !== "calendar-event";
  let facts;
  if (document) {
    const contractId = field("contract_id");
    const contract = context.contracts.find((item) => item.id === contractId && item.organization_id === organizationId);
    if (!contract || !retainedContract(contract)) throw new Error("Select a current contract with retained source text. Expired or unretained source cannot back a follow-up.");
    const assignee = field("assignee_id");
    if (!context.members.some((member) => member.user_id === assignee)) throw new Error("Select an actual workspace member for the follow-up.");
    const title = field("task_title").trim(), description = field("task_description").trim(), query = field("query").trim();
    if (!title || title.length > 512) throw new Error("Supply the exact follow-up title in 1–512 characters.");
    if (description.length > 4000) throw new Error("Follow-up description cannot exceed 4000 characters.");
    if (query.length < 2 || query.length > 200) throw new Error("Supply a literal evidence phrase of 2–200 characters.");
    facts = { contract_id: contractId, assignee_id: assignee, due_at: explicitInstant(field("due_at"), "Follow-up due time"), task_title: title, task_description: description, query };
  }
  if (goalType === "retained-document-follow-up") return { ...base, goal_type: goalType, ...facts! };
  const grant = calendarGrants(context.connections, organizationId).find((entry) => entry.value === field("calendar_target"));
  if (!grant) throw new Error("Select an active OAuth connection and its exact originally granted calendar. Calendar IDs are never inferred.");
  const summary = field("summary").trim();
  if (!summary || summary.length > 512) throw new Error("Supply the exact calendar event summary in 1–512 characters.");
  const start = explicitInstant(field("start_at"), "Event start"), end = explicitInstant(field("end_at"), "Event end");
  if (Date.parse(end) <= Date.parse(start) || Date.parse(end) - Date.parse(start) > 31 * 86400000) throw new Error("The event must end after it starts, within 31 days.");
  const calendar = { type: "calendar_event_created" as const, connection_id: grant.connection.id, calendar_id: grant.calendarId, summary, start_at: start, end_at: end };
  return goalType === "calendar-event" ? { ...base, goal_type: goalType, calendar } : { ...base, goal_type: goalType, ...facts!, calendar };
}
