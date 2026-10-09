import { describe, expect, it } from "vitest";
import { assignmentInput } from "./hosted-agent-assignment";
import { calendarGrants, hostedTaskPollInterval } from "./hosted-agent-state";
import { contractFixture, memberFixture } from "@/test/agent-fixtures";
import { calendarConnectionFixture, hostedCapabilities, hostedTaskFixture } from "@/test/hosted-fixtures";

function values(overrides: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ goal_type: "retained-document-follow-up", planner_mode: "deterministic", goal: "Prepare my fixed follow-up", deadline_at: new Date(Date.now() + 3600000).toISOString(), contract_id: "contract-1", assignee_id: "user-1", query: "renewal notice", task_title: "My exact title", task_description: "My exact description", due_at: "2099-10-30T09:00:00+02:00", calendar_target: JSON.stringify(["connection-1", "sandbox@example.test"]), summary: "My exact event", start_at: "2099-10-30T09:00:00Z", end_at: "2099-10-30T10:00:00Z", ...overrides })) form.set(key, value);
  return form;
}
const scope = { organizationId: "org-1", capabilities: hostedCapabilities, contracts: [contractFixture], members: [memberFixture], connections: [calendarConnectionFixture] };
describe("hosted assignment facts and exact scope", () => {
  it("normalizes only explicit aware instants and preserves human title/description", () => {
    const input = assignmentInput(values(), scope, "stable-key");
    expect(input).toMatchObject({ idempotency_key: "stable-key", goal_type: "retained-document-follow-up", task_title: "My exact title", task_description: "My exact description", due_at: "2099-10-30T07:00:00.000Z" });
    expect(input).not.toHaveProperty("calendar"); expect(input).not.toHaveProperty("require_approval");
  });
  it("calendar-only input cannot acquire irrelevant document/assignee grants", () => {
    const input = assignmentInput(values({ goal_type: "calendar-event" }), scope, "stable-key");
    expect(input).not.toHaveProperty("contract_id"); expect(input).not.toHaveProperty("assignee_id"); expect(input).not.toHaveProperty("query");
    expect(input).toMatchObject({ calendar: { connection_id: "connection-1", calendar_id: "sandbox@example.test", summary: "My exact event" } });
  });
  it("combined outcome requires both exact scopes and an explicit timezone", () => {
    expect(assignmentInput(values({ goal_type: "follow-up-and-calendar" }), scope, "key")).toHaveProperty("calendar");
    expect(() => assignmentInput(values({ due_at: "2099-10-30T09:00:00" }), scope, "key")).toThrow(/explicit/);
    expect(() => assignmentInput(values({ due_at: "2099-02-30T09:00:00Z" }), scope, "key")).toThrow();
  });
  it.each([{ retain_source_text: false }, { expires_at: "2020-01-01T00:00:00Z" }, { organization_id: "other-org" }])("rejects unavailable/other-tenant source %j", (patch) => {
    expect(() => assignmentInput(values(), { ...scope, contracts: [{ ...contractFixture, ...patch }] }, "key")).toThrow(/retained/);
  });
  it("does not infer members, calendar grant, intervals or deadlines", () => {
    expect(() => assignmentInput(values({ assignee_id: "unknown" }), scope, "key")).toThrow(/actual workspace/);
    expect(() => assignmentInput(values({ goal_type: "calendar-event", calendar_target: "primary" }), scope, "key")).toThrow(/never inferred/);
    expect(() => assignmentInput(values({ goal_type: "calendar-event", end_at: "2099-10-30T08:00:00Z" }), scope, "key")).toThrow(/end after/);
    expect(() => assignmentInput(values({ deadline_at: new Date(Date.now() + 8 * 86400000).toISOString() }), scope, "key")).toThrow(/within 7 days/);
  });
  it("capability disables unsupported model and requires excerpt disclosure consent", () => {
    expect(() => assignmentInput(values({ planner_mode: "model" }), scope, "key")).toThrow(/not enabled/);
    const modelScope = { ...scope, capabilities: { ...hostedCapabilities, planner_modes: ["deterministic", "model"] as const } };
    expect(() => assignmentInput(values({ planner_mode: "model" }), { ...modelScope, capabilities: { ...modelScope.capabilities, planner_modes: [...modelScope.capabilities.planner_modes] } }, "key")).toThrow(/sharing/);
  });
  it("lists only active encrypted original calendar grants and stops terminal/deadline polling", () => {
    expect(calendarGrants([calendarConnectionFixture, { ...calendarConnectionFixture, id: "revoked", status: "revoked" }, { ...calendarConnectionFixture, id: "wrong-tenant", organization_id: "other" }, { ...calendarConnectionFixture, id: "no-create-grant", capabilities: [] }], "org-1")).toHaveLength(1);
    expect(hostedTaskPollInterval([hostedTaskFixture])).toBe(5000);
    expect(hostedTaskPollInterval([{ ...hostedTaskFixture, status: "awaiting_input" }])).toBe(5000);
    expect(hostedTaskPollInterval([{ ...hostedTaskFixture, status: "succeeded" }])).toBe(false);
    expect(hostedTaskPollInterval([{ ...hostedTaskFixture, deadline_at: "2020-01-01T00:00:00Z" }])).toBe(false);
  });
});
