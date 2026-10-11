import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { api, ApiError } from "@/lib/api";
import type { HostedAgentTask } from "@/lib/hosted-agent-types";
import type { Role } from "@/lib/types";
import { contractFixture, memberFixture } from "@/test/agent-fixtures";
import { calendarConnectionFixture, hostedCapabilities, hostedTaskFixture } from "@/test/hosted-fixtures";
import { agentQueryWrapper } from "@/test/agent-query-wrapper";
import { HostedTaskList } from "./hosted-task-list";
import { HostedTaskDetail } from "./hosted-task-detail";

const workspace = vi.hoisted(() => ({ activeOrganization: { id: "org-1" }, activeRole: "owner" as Role | null, user: { id: "user-1" }, isDemo: false, isLoading: false, error: null as Error | null }));
const session = vi.hoisted(() => ({ status: "authenticated", data: { user: { id: "oidc-user-1" } } }));
vi.mock("../workspace-provider", () => ({ useWorkspace: () => workspace }));
vi.mock("next-auth/react", () => ({ useSession: () => session }));
vi.mock("@/lib/api", async () => {
  const { ApiError } = await import("@/lib/api/client");
  return { ApiError, api: { hostedAgentCapabilities: vi.fn(), hostedAgentTasks: vi.fn(), hostedAgentTask: vi.fn(), createHostedAgentTask: vi.fn(), cancelHostedAgentTask: vi.fn(), contracts: vi.fn(), members: vi.fn(), integrations: vi.fn() } };
});
beforeEach(() => {
  Object.assign(workspace, { activeOrganization: { id: "org-1" }, activeRole: "owner", user: { id: "user-1" }, isDemo: false, isLoading: false, error: null });
  Object.assign(session, { status: "authenticated", data: { user: { id: "oidc-user-1" } } });
  vi.mocked(api.hostedAgentCapabilities).mockReset().mockResolvedValue(hostedCapabilities);
  vi.mocked(api.hostedAgentTasks).mockReset().mockResolvedValue([]);
  vi.mocked(api.hostedAgentTask).mockReset().mockResolvedValue(hostedTaskFixture);
  vi.mocked(api.createHostedAgentTask).mockReset().mockResolvedValue(hostedTaskFixture);
  vi.mocked(api.cancelHostedAgentTask).mockReset().mockResolvedValue({ ...hostedTaskFixture, status: "cancelled" });
  vi.mocked(api.contracts).mockReset().mockResolvedValue([contractFixture]);
  vi.mocked(api.members).mockReset().mockResolvedValue([memberFixture]);
  vi.mocked(api.integrations).mockReset().mockResolvedValue([calendarConnectionFixture]);
});
function show() { const { Wrapper } = agentQueryWrapper(); return render(<HostedTaskList />, { wrapper: Wrapper }); }
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
async function fill(goal = "retained-document-follow-up") {
  await screen.findByLabelText("Outcome to create"); change("Outcome to create", goal);
  await waitFor(() => expect(screen.getByRole("button", { name: "Assign to LensLayer agent" })).toBeEnabled());
  change("Your goal", "Prepare my explicit document follow-up");
  change("Execution deadline (with timezone)", new Date(Date.now() + 3600000).toISOString());
  if (goal !== "calendar-event") {
    change("Retained source contract", "contract-1"); change("Follow-up assignee", "user-1");
    change("Literal evidence phrase", "renewal notice"); change("Follow-up due time (with timezone)", "2099-10-30T09:00:00+02:00");
    change("Exact follow-up title", "Human-authored exact title"); change("Exact follow-up description (optional)", "Human-authored description");
  }
  if (goal !== "retained-document-follow-up") {
    change("Exact connected calendar grant", JSON.stringify(["connection-1", "sandbox@example.test"]));
    change("Exact event summary", "Human-authored appointment");
    change("Event start (with timezone)", "2099-10-30T09:00:00Z"); change("Event end (with timezone)", "2099-10-30T10:00:00Z");
  }
}
function submit() { fireEvent.click(screen.getByRole("button", { name: "Assign to LensLayer agent" })); }

describe("hosted task assignment", () => {
  it("assigns exact document facts via human API without bearer entry and connects recorded status", async () => {
    const { container } = show(); await fill(); submit();
    await waitFor(() => expect(api.createHostedAgentTask).toHaveBeenCalledTimes(1));
    const [org, input, signal] = vi.mocked(api.createHostedAgentTask).mock.calls[0];
    expect(org).toBe("org-1"); expect(signal).toBeInstanceOf(AbortSignal);
    expect(input).toMatchObject({ goal_type: "retained-document-follow-up", planner_mode: "deterministic", contract_id: "contract-1", assignee_id: "user-1", due_at: "2099-10-30T07:00:00.000Z", task_title: "Human-authored exact title", task_description: "Human-authored description" });
    expect(input).not.toHaveProperty("calendar"); expect(input).not.toHaveProperty("token");
    expect(await screen.findByText("Assignment recorded")).toBeInTheDocument();
    expect(screen.getByText(/No execution or approval is assumed yet/)).toBeInTheDocument();
    expect(container.querySelector('input[name*="token"]')).toBeNull();
  });
  it.each(["calendar-event", "follow-up-and-calendar"])("uses exact Calendar grants for %s and no irrelevant scope", async (goal) => {
    show(); await fill(goal); submit(); await waitFor(() => expect(api.createHostedAgentTask).toHaveBeenCalledTimes(1));
    const input = vi.mocked(api.createHostedAgentTask).mock.calls[0][1];
    expect(input).toMatchObject({ goal_type: goal, calendar: { type: "calendar_event_created", connection_id: "connection-1", calendar_id: "sandbox@example.test", summary: "Human-authored appointment" } });
    if (goal === "calendar-event") { expect(input).not.toHaveProperty("contract_id"); expect(api.contracts).not.toHaveBeenCalled(); expect(api.members).not.toHaveBeenCalled(); }
    else expect(input).toHaveProperty("contract_id", "contract-1");
  });
  it("requires an explicit timezone instead of inferring browser time", async () => {
    show(); await fill(); change("Follow-up due time (with timezone)", "2099-10-30T09:00:00"); submit();
    expect(await screen.findByText(/Follow-up due time needs an ISO/)).toBeInTheDocument(); expect(api.createHostedAgentTask).not.toHaveBeenCalled();
  });
  it("keeps a stable frozen request on ambiguous submit and does not auto-retry", async () => {
    vi.mocked(api.createHostedAgentTask).mockRejectedValueOnce(new Error("response lost"));
    show(); await fill(); submit();
    expect(await screen.findByText(/Assignment could not be confirmed/)).toBeInTheDocument();
    expect(screen.getByLabelText("Your goal")).toBeDisabled(); expect(api.createHostedAgentTask).toHaveBeenCalledTimes(1);
    const first = vi.mocked(api.createHostedAgentTask).mock.calls[0][1];
    fireEvent.click(screen.getByRole("button", { name: "Retry identical assignment" }));
    await waitFor(() => expect(api.createHostedAgentTask).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.createHostedAgentTask).mock.calls[1][1]).toEqual(first);
    expect(await screen.findByText("Assignment recorded")).toBeInTheDocument();
  });
  it("preserves an uncertain assignment key across a failed list refresh", async () => {
    vi.mocked(api.createHostedAgentTask).mockRejectedValueOnce(new Error("response lost"));
    show(); await fill(); submit(); expect(await screen.findByText(/Assignment could not be confirmed/)).toBeInTheDocument();
    const original = vi.mocked(api.createHostedAgentTask).mock.calls[0][1];
    vi.mocked(api.hostedAgentTasks).mockRejectedValueOnce(new Error("List temporarily unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh assignments" }));
    expect(await screen.findByText("List temporarily unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry identical assignment" }));
    await waitFor(() => expect(api.createHostedAgentTask).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.createHostedAgentTask).mock.calls[1][1]).toEqual(original);
  });
  it("lets a definite validation rejection be corrected, not a conflicting recorded intent", async () => {
    vi.mocked(api.createHostedAgentTask).mockRejectedValueOnce(new ApiError("Literal phrase unavailable", 422));
    show(); await fill(); submit(); expect(await screen.findByText(/Literal phrase unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit rejected request" })); expect(screen.getByLabelText("Your goal")).toBeEnabled();
    vi.mocked(api.createHostedAgentTask).mockRejectedValueOnce(new ApiError("Conflict", 409)); submit();
    expect(await screen.findByText(/key is bound to a different request/)).toBeInTheDocument(); expect(screen.queryByText("Edit rejected request")).toBeNull();
  });
  it("uses capabilities for model selection and requires explicit excerpt-sharing acknowledgement", async () => {
    vi.mocked(api.hostedAgentCapabilities).mockResolvedValue({ ...hostedCapabilities, planner_modes: ["deterministic", "model"] });
    show(); await fill();
    expect(screen.getByText(/Choosing model assistance shares your goal/)).toBeInTheDocument();
    change("Planning mode", "model");
    expect(screen.getByText(/any retrieved document excerpt will be sent to OpenAI/)).toBeInTheDocument();
    // fire submit to exercise runtime guard as well as native required checkbox.
    fireEvent.submit(screen.getByLabelText("Your goal").closest("form")!);
    expect(api.createHostedAgentTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Share this scoped context/ })); submit();
    await waitFor(() => expect(api.createHostedAgentTask).toHaveBeenCalledWith("org-1", expect.objectContaining({ planner_mode: "model" }), expect.any(AbortSignal)));
  });
  it("preserves the exact request after a pagehide interrupts an uncertain submit", async () => {
    let done!: (task: HostedAgentTask) => void;
    vi.mocked(api.createHostedAgentTask).mockImplementationOnce(() => new Promise((resolve) => { done = resolve; }));
    show(); await fill(); submit();
    const [, request, signal] = vi.mocked(api.createHostedAgentTask).mock.calls[0];
    fireEvent(window, new Event("pagehide"));
    expect(signal?.aborted).toBe(true);
    expect(screen.getByText(/Submission was interrupted/)).toBeInTheDocument();
    await act(async () => done(hostedTaskFixture));
    expect(screen.queryByText("Assignment recorded")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry identical assignment" }));
    await waitFor(() => expect(api.createHostedAgentTask).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.createHostedAgentTask).mock.calls[1][1]).toEqual(request);
  });
  it("handles disabled capabilities and unavailable source without inventing targets", async () => {
    vi.mocked(api.hostedAgentCapabilities).mockResolvedValue({ ...hostedCapabilities, enabled: false });
    const first = show(); expect(await screen.findByText(/Hosted assignments are disabled/)).toBeInTheDocument(); expect(screen.queryByText("Assign to LensLayer agent")).toBeNull(); first.unmount();
    vi.mocked(api.hostedAgentCapabilities).mockResolvedValue(hostedCapabilities);
    vi.mocked(api.contracts).mockResolvedValue([{ ...contractFixture, retain_source_text: false }]);
    show(); change(await screen.findByLabelText("Outcome to create").then(() => "Outcome to create"), "retained-document-follow-up");
    expect(await screen.findByRole("option", { name: /source unavailable or expired/ })).toBeDisabled();
    expect(screen.getByRole("link", { name: /Upload a source with text retention/ })).toHaveAttribute("href", "/contracts/new");
  });
  it("shows scope/read errors and hides cached assignment data on auth failure", async () => {
    vi.mocked(api.contracts).mockRejectedValue(new Error("Scope failed"));
    const view = show(); change(await screen.findByLabelText("Outcome to create").then(() => "Outcome to create"), "retained-document-follow-up");
    expect(await screen.findByText(/Scope choices could not load/)).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Assign to LensLayer agent" })).toBeDisabled(); view.unmount();
    vi.mocked(api.hostedAgentTasks).mockResolvedValue([hostedTaskFixture]); const second = show();
    expect(await screen.findByRole("heading", { name: hostedTaskFixture.goal })).toBeInTheDocument();
    vi.mocked(api.hostedAgentTasks).mockRejectedValue(new ApiError("Role revoked", 403)); fireEvent.click(screen.getByRole("button", { name: "Refresh assignments" }));
    expect(await screen.findByText("Access restricted")).toBeInTheDocument(); expect(screen.queryByRole("heading", { name: hostedTaskFixture.goal })).toBeNull(); second.unmount();
  });
  it.each(["workspace", "user", "session", "role", "demo"])("aborts and drops late creation after %s changes", async (boundary) => {
    let done!: (task: HostedAgentTask) => void;
    vi.mocked(api.createHostedAgentTask).mockImplementation(() => new Promise((resolve) => { done = resolve; }));
    const view = show(); await fill(); submit();
    const signal = vi.mocked(api.createHostedAgentTask).mock.calls[0][2]!;
    if (boundary === "workspace") workspace.activeOrganization = { id: "org-2" };
    if (boundary === "user") workspace.user = { id: "user-2" };
    if (boundary === "session") session.data = { user: { id: "oidc-user-2" } };
    if (boundary === "role") workspace.activeRole = "viewer";
    if (boundary === "demo") workspace.isDemo = true;
    view.rerender(<HostedTaskList />);
    expect(signal.aborted).toBe(true);
    await act(async () => done(hostedTaskFixture));
    expect(screen.queryByText("Assignment recorded")).toBeNull(); expect(api.createHostedAgentTask).toHaveBeenCalledTimes(1);
  });
  it.each(["viewer", "reviewer", null] as const)("blocks private task calls for %s", (role) => {
    workspace.activeRole = role; show(); expect(screen.getByText("Administrator access required")).toBeInTheDocument();
    expect(api.hostedAgentTasks).not.toHaveBeenCalled(); expect(api.hostedAgentCapabilities).not.toHaveBeenCalled();
  });
  it("demo and signed-out pages are read-only with no task API calls", () => {
    workspace.isDemo = true; const demo = show(); expect(screen.getByText(/Synthetic preview/)).toBeInTheDocument(); expect(api.hostedAgentTasks).not.toHaveBeenCalled(); demo.unmount();
    workspace.isDemo = false; session.status = "unauthenticated"; show(); expect(screen.getByText(/Private workspace access could not be confirmed/)).toBeInTheDocument(); expect(api.hostedAgentCapabilities).not.toHaveBeenCalled();
  });
  it("does not expose model mode when disabled, and has accessible explicit scope controls", async () => {
    const { container } = show(); await fill("follow-up-and-calendar");
    expect(screen.queryByRole("option", { name: /Model-assisted/ })).toBeNull();
    expect((await axe(container)).violations).toEqual([]);
  });
  it("drops late task list responses on a tenant switch", async () => {
    let resolve!: (task: HostedAgentTask[]) => void;
    vi.mocked(api.hostedAgentTasks).mockImplementation((org) => org === "org-1" ? new Promise((done) => { resolve = done; }) : Promise.resolve([]));
    const view = show(); workspace.activeOrganization = { id: "org-2" }; view.rerender(<HostedTaskList />);
    await act(async () => resolve([hostedTaskFixture]));
    expect(await screen.findByText("No hosted assignments yet")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: hostedTaskFixture.goal })).toBeNull();
  });
});

describe("hosted status and cancellation", () => {
  it.each(["queued", "planning", "awaiting_input", "awaiting_approval", "running", "succeeded", "failed", "cancelled"] as const)("shows %s with honest method and run link when present", async (status) => {
    vi.mocked(api.hostedAgentTask).mockResolvedValue({ ...hostedTaskFixture, status, run_id: "run/1" });
    const { Wrapper } = agentQueryWrapper(); render(<HostedTaskDetail taskId="assignment-1" />, { wrapper: Wrapper });
    expect(await screen.findByText("lenslayer_hosted_agent")).toBeInTheDocument(); expect(screen.getByText("Fixed workflow · no model")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Inspect.*(actions|request|receipts)/ })).toHaveAttribute("href", "/runs/run%2F1");
    if (["succeeded", "failed", "cancelled"].includes(status)) expect(screen.queryByRole("button", { name: "Cancel assignment" })).toBeNull();
    if (status === "awaiting_approval") expect(screen.getByText(/Human decision required/)).toBeInTheDocument();
  });
  it("confirms cancellation through human API and leaves receipt interpretation in Runs", async () => {
    const { Wrapper } = agentQueryWrapper(); render(<HostedTaskDetail taskId="assignment-1" />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Cancel assignment" })); expect(api.cancelHostedAgentTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(api.cancelHostedAgentTask).toHaveBeenCalledWith("org-1", "assignment-1", expect.any(AbortSignal)));
    expect(await screen.findByText(/Completed or uncertain remote effects are not rolled back/)).toBeInTheDocument();
  });
  it("does not report cancellation or automatically retry an ambiguous cancellation", async () => {
    vi.mocked(api.cancelHostedAgentTask).mockRejectedValueOnce(new Error("response lost"));
    const { Wrapper } = agentQueryWrapper(); render(<HostedTaskDetail taskId="assignment-1" />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Cancel assignment" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cancellation could not be confirmed");
    expect(api.cancelHostedAgentTask).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/New work is stopped/)).toBeNull();
  });
  it.each(["workspace", "user", "role"]) ("drops late cancellation after %s changes", async (boundary) => {
    let done!: (task: HostedAgentTask) => void;
    vi.mocked(api.cancelHostedAgentTask).mockImplementationOnce(() => new Promise((resolve) => { done = resolve; }));
    const { Wrapper } = agentQueryWrapper(); const view = render(<HostedTaskDetail taskId="assignment-1" />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Cancel assignment" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    const signal = vi.mocked(api.cancelHostedAgentTask).mock.calls[0][2];
    if (boundary === "workspace") workspace.activeOrganization = { id: "org-2" };
    if (boundary === "user") workspace.user = { id: "user-2" };
    if (boundary === "role") workspace.activeRole = "viewer";
    view.rerender(<HostedTaskDetail taskId="assignment-1" />);
    expect(signal?.aborted).toBe(true);
    await act(async () => done({ ...hostedTaskFixture, status: "cancelled" }));
    expect(screen.queryByText(/New work is stopped/)).toBeNull();
  });
});
