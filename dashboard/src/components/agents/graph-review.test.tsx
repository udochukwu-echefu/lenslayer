import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { api, ApiError } from "@/lib/api";
import type { AgentAction, AgentRun, WorkflowGraph } from "@/lib/agent-types";
import { contextActionFixture, contextEvidenceFixture, graphFixture, graphRunFixture } from "@/test/context-fixtures";
import { agentQueryWrapper } from "@/test/agent-query-wrapper";
import { ActionReview } from "./action-review";
import { RunDetail } from "./run-detail";
import { RunGraph } from "./run-graph";
import { ActionEvidence } from "./action-evidence";

const workspace = vi.hoisted(() => ({ activeOrganization: { id: "org-1" }, activeRole: "owner" as string | null, isDemo: false }));
vi.mock("../workspace-provider", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", async () => { const { ApiError } = await import("@/lib/api/client"); return { ApiError, api: { agentRun: vi.fn(), agentRunGraph: vi.fn(), agentRunActions: vi.fn(), agentRunEvents: vi.fn(), agentInputRequests: vi.fn(), decideAgentAction: vi.fn(), agentRunContextEvidence: vi.fn(), agentRunEvidence: vi.fn(), cancelAgentRun: vi.fn() } }; });
beforeEach(() => {
  workspace.activeRole = "owner"; workspace.isDemo = false; vi.clearAllMocks();
  vi.mocked(api.agentRun).mockResolvedValue(graphRunFixture);
  vi.mocked(api.agentRunGraph).mockResolvedValue(graphFixture);
  vi.mocked(api.agentRunActions).mockResolvedValue([contextActionFixture]);
  vi.mocked(api.agentRunEvents).mockResolvedValue([]);
  vi.mocked(api.agentInputRequests).mockResolvedValue([]);
  vi.mocked(api.agentRunContextEvidence).mockResolvedValue(contextEvidenceFixture);
  vi.mocked(api.decideAgentAction).mockResolvedValue(contextActionFixture);
});
function review(action: AgentAction = contextActionFixture, run: AgentRun = graphRunFixture, graph: WorkflowGraph | undefined = graphFixture) {
  const { Wrapper } = agentQueryWrapper();
  return render(<ActionReview organizationId="org-1" run={run} action={action} graph={graph} events={[]} />, { wrapper: Wrapper });
}

it("shows exact context fields, plan binding and a false factual branch without inventing contract links", async () => {
  const { container } = review();
  expect(screen.getByRole("link", { name: "context-1" })).toHaveAttribute("href", "/context/context-1");
  expect(container.querySelector('a[href^="/contracts/"]')).toBeNull();
  expect(screen.getByText(/be skipped without creating a task/)).toBeInTheDocument();
  expect(screen.getByText(/not truth inferred from the source/)).toBeInTheDocument();
  expect(screen.getByText(/does not perform the business follow-up/)).toBeInTheDocument();
  expect(api.agentRunContextEvidence).not.toHaveBeenCalled();
  const details = screen.getByText("Inspect retained evidence receipt").closest("details")!;
  details.open = true; fireEvent(details, new Event("toggle"));
  expect(await screen.findByText(contextEvidenceFixture.excerpt)).toBeInTheDocument();
  expect(api.agentRunContextEvidence).toHaveBeenCalledWith("org-1", "graph-run", "context-receipt", expect.any(AbortSignal));
  expect(api.agentRunEvidence).not.toHaveBeenCalled();
  expect(screen.getByText(/Python Unicode characters/)).toBeInTheDocument();
});

it("permits only the existing human decision route for a bound context node", async () => {
  review(); fireEvent.change(screen.getByLabelText("Approval or rejection reason"), { target: { value: "Checked the supplied false fact, exact task and source" } });
  fireEvent.click(screen.getByRole("button", { name: "Approve exact skip" }));
  await waitFor(() => expect(api.decideAgentAction).toHaveBeenCalledWith("org-1", "graph-run", "context-action", { decision: "approved", reason: "Checked the supplied false fact, exact task and source" }));
});

it.each(["viewer", "reviewer", null])("does not expose context-node approvals to %s", (role) => {
  workspace.activeRole = role; review(); expect(screen.queryByRole("button", { name: /Approve|Reject/ })).toBeNull();
});

it("denies approval for unknown versions, graph hash/action mismatch or changed exact task fields", () => {
  const cases: [AgentAction, WorkflowGraph | undefined][] = [
    [{ ...contextActionFixture, tool_version: "2" }, graphFixture],
    [contextActionFixture, { ...graphFixture, plan_sha256: "d".repeat(64) }],
    [contextActionFixture, { ...graphFixture, nodes: [{ ...graphFixture.nodes[0], action_id: "other-action" }] }],
    [{ ...contextActionFixture, input: { ...contextActionFixture.input, title: "Changed title" } } as AgentAction, graphFixture],
    [contextActionFixture, { ...graphFixture, run_id: "other-run" }],
    [{ ...contextActionFixture, run_id: "other-run" }, graphFixture],
  ];
  for (const [action, graph] of cases) { const view = review(action, graphRunFixture, graph); expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull(); view.unmount(); }
});

it("hides expired context evidence after a denied refresh instead of retaining a cached excerpt", async () => {
  review(); const details = screen.getByText("Inspect retained evidence receipt").closest("details")!; details.open = true; fireEvent(details, new Event("toggle"));
  await screen.findByText(contextEvidenceFixture.excerpt);
  vi.mocked(api.agentRunContextEvidence).mockRejectedValue(new ApiError("Expired", 410));
  fireEvent.click(screen.getByRole("button", { name: "Refresh evidence" }));
  expect(await screen.findByText("Evidence unavailable")).toBeInTheDocument(); expect(screen.queryByText(contextEvidenceFixture.excerpt)).toBeNull();
});

it("drops a hidden evidence excerpt from cache and checks access again on reopening", async () => {
  const { client, Wrapper } = agentQueryWrapper();
  render(<ActionEvidence organizationId="org-1" runId={graphRunFixture.id} evidenceId={contextEvidenceFixture.id} isDemo={false} kind="context" />, { wrapper: Wrapper });
  const details = screen.getByText("Inspect retained evidence receipt").closest("details")!;
  details.open = true; fireEvent(details, new Event("toggle"));
  await screen.findByText(contextEvidenceFixture.excerpt);
  details.open = false; fireEvent(details, new Event("toggle"));
  await waitFor(() => expect(client.getQueryCache().findAll({ queryKey: ["agent-run", "org-1", graphRunFixture.id, "context-evidence"] })).toHaveLength(0));
  vi.mocked(api.agentRunContextEvidence).mockRejectedValue(new ApiError("Source removed", 410));
  details.open = true; fireEvent(details, new Event("toggle"));
  expect(await screen.findByText("Evidence unavailable")).toBeInTheDocument();
  expect(screen.queryByText(contextEvidenceFixture.excerpt)).toBeNull();
});

it("never renders an excerpt returned for a different receipt", async () => {
  vi.mocked(api.agentRunContextEvidence).mockResolvedValue({ ...contextEvidenceFixture, id: "another-receipt" });
  review(); const details = screen.getByText("Inspect retained evidence receipt").closest("details")!;
  details.open = true; fireEvent(details, new Event("toggle"));
  await waitFor(() => expect(api.agentRunContextEvidence).toHaveBeenCalled());
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText(contextEvidenceFixture.excerpt)).toBeNull();
});

it("renders original ordered dependencies, all node states and terminal run precedence", () => {
  const nodes = ["blocked", "ready", "completed", "skipped"].map((status, i) => ({ ...graphFixture.nodes[0], id: `node-${i}`, action_id: `action-${i}`, depends_on: i ? [`node-${i - 1}`] : [], status })) as WorkflowGraph["nodes"];
  render(<RunGraph run={{ ...graphRunFixture, status: "cancelled" }} graph={{ ...graphFixture, nodes }} />);
  for (const state of ["Blocked", "Ready", "Completed", "Skipped"]) expect(screen.getByText(state)).toBeInTheDocument();
  expect(screen.getByText(/Unfinished node states do not authorize execution/)).toBeInTheDocument();
  expect(screen.getAllByText("Depends on")).toHaveLength(4); expect(screen.getAllByText("Not before")).toHaveLength(4);
});

it("reads the human graph route and reports all-false success as no task effects, not business completion", async () => {
  vi.mocked(api.agentRun).mockResolvedValue({ ...graphRunFixture, status: "succeeded", result: { type: "graph", verified: true, completed_nodes: {}, skipped_node_ids: ["review"] } });
  vi.mocked(api.agentRunGraph).mockResolvedValue({ ...graphFixture, nodes: [{ ...graphFixture.nodes[0], status: "skipped" }] });
  vi.mocked(api.agentRunActions).mockResolvedValue([{ ...contextActionFixture, status: "cancelled", approval_status: "approved", error_code: "branch_false", attempts: 0 }]);
  const { Wrapper } = agentQueryWrapper(); const { container } = render(<RunDetail runId="graph-run" />, { wrapper: Wrapper });
  expect(await screen.findByText("Verified outcome: applicable tasks created or approved branches skipped")).toBeInTheDocument();
  expect(screen.getByText(/An all-false graph has no task effects/)).toBeInTheDocument();
  await waitFor(() => expect(api.agentRunGraph).toHaveBeenCalledWith("org-1", "graph-run", expect.any(AbortSignal)));
  expect(screen.queryByRole("button", { name: /Approve|Create graph/ })).toBeNull();
  expect(container.querySelector('a[href^="/contracts/"]')).toBeNull();
});

it("does not assume readiness or enable approval for a malformed/cross-run graph readback", async () => {
  vi.mocked(api.agentRunGraph).mockResolvedValue({ ...graphFixture, run_id: "other-run" });
  const { Wrapper } = agentQueryWrapper(); render(<RunDetail runId="graph-run" />, { wrapper: Wrapper });
  expect(await screen.findByText(/Graph readback is not recognized/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
});

it("has no detected axe violations in the graph/context action review", async () => {
  const { container } = review();
  expect((await axe(container)).violations).toEqual([]);
});
