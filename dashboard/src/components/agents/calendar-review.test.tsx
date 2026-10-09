import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { AgentAction, AgentRun, CalendarActionInput } from "@/lib/agent-types";
import { actionFixture, runFixture } from "@/test/agent-fixtures";
import { agentQueryWrapper } from "@/test/agent-query-wrapper";
import { ActionReview } from "./action-review";
import { SuccessConditionView } from "./success-condition";

const workspace = vi.hoisted(() => ({ activeRole: "owner", isDemo: false }));
vi.mock("../workspace-provider", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", () => ({ api: { decideAgentAction: vi.fn(), reconcileAgentAction: vi.fn(), agentRunEvidence: vi.fn() } }));
const input: CalendarActionInput & { description: string } = { type: "calendar_event_created", connection_id: "connection-1", calendar_id: "sandbox@example.test", summary: "Exact renewal reminder", start_at: "2099-10-30T09:00:00Z", end_at: "2099-10-30T10:00:00Z", description: "Explicit description" };
const run: AgentRun = { ...runFixture, contract_ids: [], allowed_tools: ["google_calendar.events.create"], calendar_targets: [{ connection_id: input.connection_id, calendar_id: input.calendar_id }], success_condition: input };
const action: AgentAction = { ...actionFixture, tool: "google_calendar.events.create", input };
function review(record = action, context = run) { const { Wrapper } = agentQueryWrapper(); return render(<ActionReview organizationId="org-1" run={context} action={record} events={[]} />, { wrapper: Wrapper }); }
beforeEach(() => { workspace.activeRole = "owner"; workspace.isDemo = false; vi.clearAllMocks(); vi.mocked(api.decideAgentAction).mockResolvedValue(action); vi.mocked(api.reconcileAgentAction).mockResolvedValue(action); });

it("renders exact calendar fields and approves exact event, never task or undefined target", async () => {
  const { container } = review();
  expect(screen.getByText(input.calendar_id)).toBeInTheDocument(); expect(screen.getByText(input.start_at)).toBeInTheDocument(); expect(screen.getByText(input.end_at)).toBeInTheDocument();
  expect(screen.queryByText("Assignee user ID")).toBeNull(); expect(container.querySelector('a[href*="undefined"]')).toBeNull();
  expect(screen.queryByText("Inspect retained evidence receipt")).toBeNull(); expect(api.agentRunEvidence).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Approval or rejection reason"), { target: { value: "Checked exact calendar and interval" } });
  fireEvent.click(screen.getByRole("button", { name: "Approve exact event" }));
  await waitFor(() => expect(api.decideAgentAction).toHaveBeenCalledWith("org-1", "run-1", "action-1", { decision: "approved", reason: "Checked exact calendar and interval" }));
  expect(screen.queryByRole("button", { name: "Approve exact task" })).toBeNull();
});
it("unknown/partial effects are explicit; only a human admin can enqueue read-back reconciliation", async () => {
  review({ ...action, status: "unknown_outcome", result: { verified: false, partial_effect: true, dispatch_may_have_effect: true } }, { ...run, status: "failed", error_code: "unknown_outcome" });
  expect(screen.getByText(/Unknown remote effect:/)).toBeInTheDocument(); expect(screen.getByText(/Partial effect recorded:/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Request read-back reconciliation" }));
  await waitFor(() => expect(api.reconcileAgentAction).toHaveBeenCalledWith("org-1", "run-1", "action-1"));
});
it("unknown tools, malformed calendar input or mismatched conditions cannot be approved", () => {
  const rendered = review({ ...action, tool: "unknown.exec" });
  expect(screen.getByText("Unsupported action input")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
  rendered.unmount();
  const second = review({ ...action, input: { ...input, end_at: "invalid" } });
  expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull(); second.unmount();
  const third = review({ ...action, input: { ...input, calendar_id: "another@example.test" } });
  expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
  third.unmount();
  const malformed = { type: "all", conditions: [null] } as unknown as AgentRun["success_condition"];
  review(action, { ...run, success_condition: malformed });
  expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
});
it("composite conditions display exact named task/event constraints and bind condition ID", () => {
  const composite = { type: "all" as const, conditions: [{ id: "task", condition: runFixture.success_condition }, { id: "calendar", condition: input }] };
  const view = render(<SuccessConditionView condition={composite} />);
  expect(screen.getByText("contract-1")).toBeInTheDocument(); expect(screen.getByText(input.calendar_id)).toBeInTheDocument(); view.unmount();
  const incomplete = review(action, { ...run, success_condition: composite }); expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull(); incomplete.unmount();
  review({ ...action, input: { ...input, condition_id: "calendar" } }, { ...run, success_condition: composite });
  expect(screen.getByRole("button", { name: "Approve exact event" })).toBeInTheDocument();
});
it("read-only roles and demo cannot reconcile unknown effects", () => {
  workspace.isDemo = true; review({ ...action, status: "unknown_outcome" });
  expect(screen.queryByRole("button", { name: "Request read-back reconciliation" })).toBeNull();
});
