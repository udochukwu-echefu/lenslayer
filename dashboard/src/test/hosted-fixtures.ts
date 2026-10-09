import type { HostedAgentCapabilities, HostedAgentTask } from "@/lib/hosted-agent-types";
import type { IntegrationConnection } from "@/lib/types";

export const hostedCapabilities: HostedAgentCapabilities = { enabled: true, goal_types: ["retained-document-follow-up", "calendar-event", "follow-up-and-calendar"], planner_modes: ["deterministic"], max_deadline_days: 7 };
export const hostedTaskFixture: HostedAgentTask = {
  id: "assignment-1", organization_id: "org-1", created_by_user_id: "user-1", goal_type: "retained-document-follow-up", goal: "Prepare my explicit document follow-up", planner_mode: "deterministic", status: "queued", phase: "pending", run_id: null, agent_id: null, error_code: "", deadline_at: "2099-11-01T00:00:00Z", created_at: "2026-10-09T09:00:00Z", updated_at: "2026-10-09T09:00:00Z", completed_at: null,
};
export const calendarConnectionFixture: IntegrationConnection = {
  id: "connection-1", organization_id: "org-1", provider: "google_calendar", display_name: "Owned sandbox calendar", external_account_id: "oauth-grant:connection-1", status: "active", capabilities: ["google_calendar.events.create"], settings: { calendar_ids: ["sandbox@example.test"], credential_mode: "encrypted" }, last_sync_at: null, error_message: "", created_by_user_id: "user-1", created_by_name: "Owner", created_at: "2026-10-09T09:00:00Z", updated_at: "2026-10-09T09:00:00Z",
};
