import type { CalendarSuccessCondition } from "./agent-types";

/** finish-contract.md: human-only task assignment, never bearer provisioning. */
export type HostedGoalType = "retained-document-follow-up" | "calendar-event" | "follow-up-and-calendar";
export type HostedPlannerMode = "deterministic" | "model";
export type HostedTaskStatus = "queued" | "planning" | "awaiting_input" | "awaiting_approval" | "running" | "succeeded" | "failed" | "cancelled";
export interface HostedAgentCapabilities {
  enabled: boolean;
  goal_types: HostedGoalType[];
  planner_modes: HostedPlannerMode[];
  max_deadline_days: number;
}
interface HostedTaskBase {
  idempotency_key: string;
  goal: string;
  deadline_at: string;
  planner_mode?: HostedPlannerMode;
}
interface DocumentFacts {
  contract_id: string;
  version_id?: string;
  query?: string;
  assignee_id: string;
  due_at: string;
  task_title?: string;
  task_description?: string;
}
export type HostedAgentTaskCreate = HostedTaskBase & (
  | ({ goal_type: "retained-document-follow-up" } & DocumentFacts)
  | { goal_type: "calendar-event"; calendar: CalendarSuccessCondition }
  | ({ goal_type: "follow-up-and-calendar"; calendar: CalendarSuccessCondition } & DocumentFacts)
);
export interface HostedAgentTask {
  id: string;
  organization_id: string;
  created_by_user_id: string;
  goal_type: HostedGoalType;
  goal: string;
  planner_mode: HostedPlannerMode;
  status: HostedTaskStatus;
  phase: string;
  run_id: string | null;
  agent_id: string | null;
  error_code: string;
  deadline_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
