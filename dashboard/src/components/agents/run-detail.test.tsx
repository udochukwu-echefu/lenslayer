import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import type { Role } from "@/lib/types";
import { eventFixture, runFixture } from "@/test/agent-fixtures";
import { agentQueryWrapper } from "@/test/agent-query-wrapper";
import { RunDetail } from "./run-detail";

const workspace = vi.hoisted(() => ({ activeOrganization: { id: "org-1" }, activeRole: "owner" as Role | null, isDemo: false }));
vi.mock("../workspace-provider", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", async () => {
  const { ApiError } = await import("@/lib/api/client");
  return { ApiError, api: { agentRun: vi.fn(), agentRunActions: vi.fn(), agentRunEvents: vi.fn(), agentInputRequests: vi.fn(), cancelAgentRun: vi.fn(), decideAgentAction: vi.fn(), agentRunEvidence: vi.fn() } };
});
beforeEach(() => {
  workspace.activeOrganization = { id: "org-1" };
  workspace.activeRole = "owner";
  workspace.isDemo = false;
  vi.mocked(api.agentRun).mockReset().mockResolvedValue(runFixture);
  vi.mocked(api.agentRunActions).mockReset().mockResolvedValue([]);
  vi.mocked(api.agentRunEvents).mockReset().mockResolvedValue([eventFixture(1)]);
  vi.mocked(api.agentInputRequests).mockReset().mockResolvedValue([]);
  vi.mocked(api.cancelAgentRun).mockReset().mockResolvedValue({ ...runFixture, status: "cancelled" });
});

describe("run operator record", () => {
  it("labels the hosted execution owner without assuming model-assisted planning", async () => {
    vi.mocked(api.agentRun).mockResolvedValue({ ...runFixture, execution_owner: "lenslayer_hosted_agent" });
    const { Wrapper } = agentQueryWrapper(); render(<RunDetail runId="run-1" />, { wrapper: Wrapper });
    expect(await screen.findByText("lenslayer_hosted_agent")).toBeInTheDocument();
    expect(screen.getByText(/owner label alone does not imply a model was used/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /planning method/ })).toHaveAttribute("href", "/agent-tasks");
  });
  it("paginates events with the last sequence and deduplicates overlapping pages", async () => {
    const first = Array.from({ length: 100 }, (_, index) => eventFixture(index + 1));
    vi.mocked(api.agentRunEvents).mockImplementation(async (_org, _run, after) => after === 0 ? first : [eventFixture(100), eventFixture(101)]);
    const { Wrapper } = agentQueryWrapper();
    render(<RunDetail runId="run-1" />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Load more events" }));
    await waitFor(() => expect(api.agentRunEvents).toHaveBeenCalledWith("org-1", "run-1", 100, 100, expect.any(AbortSignal)));
    expect(await screen.findByLabelText("Sequence 101")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Sequence 100")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Load more events" })).not.toBeInTheDocument();
  });
  it("supports confirmed cancellation without implying rollback", async () => {
    const { Wrapper } = agentQueryWrapper();
    render(<RunDetail runId="run-1" />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Cancel run" }));
    expect(screen.getByText(/does not undo a completed action/)).toBeInTheDocument();
    expect(api.cancelAgentRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(api.cancelAgentRun).toHaveBeenCalledWith("org-1", "run-1"));
  });
  it("does not expose cancellation to reviewers or synthetic users", async () => {
    workspace.activeRole = "reviewer";
    const { Wrapper } = agentQueryWrapper();
    const { rerender } = render(<RunDetail runId="run-1" />, { wrapper: Wrapper });
    expect(await screen.findByText(runFixture.goal)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel run" })).not.toBeInTheDocument();
    workspace.activeRole = "owner";
    workspace.isDemo = true;
    rerender(<RunDetail runId="run-1" />);
    expect(await screen.findByText(/Synthetic execution example/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel run" })).not.toBeInTheDocument();
  });
  it("does not label a success without a verified server result", async () => {
    vi.mocked(api.agentRun).mockResolvedValue({ ...runFixture, status: "succeeded", result: {} });
    const { Wrapper } = agentQueryWrapper();
    render(<RunDetail runId="run-1" />, { wrapper: Wrapper });
    expect(await screen.findByRole("heading", { name: "No verified outcome" })).toBeInTheDocument();
    expect(screen.queryByText("Verified outcome: follow-up task created")).not.toBeInTheDocument();
  });
  it("shows a verified internal task result without claiming renewal completion", async () => {
    vi.mocked(api.agentRun).mockResolvedValue({ ...runFixture, status: "succeeded", result: { verified: true, task_id: "task-1" } });
    const { Wrapper } = agentQueryWrapper();
    render(<RunDetail runId="run-1" />, { wrapper: Wrapper });
    expect(await screen.findByText("Verified outcome: follow-up task created")).toBeInTheDocument();
    expect(screen.getByText(/Renewal handling, notice delivery, and legal interpretation are not verified/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel run" })).not.toBeInTheDocument();
  });
  it("uses tenant-specific queries and never displays a late record from another workspace", async () => {
    let resolve!: (value: typeof runFixture) => void;
    vi.mocked(api.agentRun).mockImplementation((org) => org === "org-1" ? new Promise((done) => { resolve = done; }) : Promise.reject(new Error("This workspace has no such run.")));
    const { Wrapper } = agentQueryWrapper();
    const { rerender } = render(<RunDetail runId="run-1" />, { wrapper: Wrapper });
    workspace.activeOrganization = { id: "org-2" };
    rerender(<RunDetail runId="run-1" />);
    await act(async () => resolve(runFixture));
    expect(await screen.findByText("This workspace has no such run.")).toBeInTheDocument();
    expect(screen.queryByText(runFixture.goal)).not.toBeInTheDocument();
    expect(api.agentRun).toHaveBeenCalledWith("org-2", "run-1", expect.any(AbortSignal));
  });
  it("hides cached private records and controls when access is denied on refresh", async () => {
    const { Wrapper } = agentQueryWrapper();
    render(<RunDetail runId="run-1" />, { wrapper: Wrapper });
    expect(await screen.findByText(runFixture.goal)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh record" })).toBeEnabled());
    vi.mocked(api.agentRun).mockRejectedValue(new ApiError("Membership revoked", 403));
    fireEvent.click(screen.getByRole("button", { name: "Refresh record" }));
    expect(await screen.findByText("Access restricted")).toBeInTheDocument();
    expect(screen.queryByText(runFixture.goal)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel run" })).not.toBeInTheDocument();
  });
});
