import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { runFixture } from "@/test/agent-fixtures";
import { agentQueryWrapper } from "@/test/agent-query-wrapper";
import { RunList } from "./run-list";

const workspace = vi.hoisted(() => ({ activeOrganization: { id: "org-1" }, isDemo: false }));
vi.mock("../workspace-provider", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", async () => {
  const { ApiError } = await import("@/lib/api/client");
  return { ApiError, api: { agentRuns: vi.fn() } };
});
beforeEach(() => {
  workspace.activeOrganization = { id: "org-1" };
  workspace.isDemo = false;
  vi.mocked(api.agentRuns).mockReset().mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("run list workspace states", () => {
  it("distinguishes hosted planning ownership and links to assignment", async () => {
    vi.mocked(api.agentRuns).mockResolvedValue([{ ...runFixture, execution_owner: "lenslayer_hosted_agent" }]);
    const { Wrapper } = agentQueryWrapper(); render(<RunList />, { wrapper: Wrapper });
    expect((await screen.findAllByText("LensLayer hosted agent")).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Agent tasks" })).toHaveAttribute("href", "/agent-tasks");
  });
  it("explains the empty state and both supported planning paths", async () => {
    const { Wrapper } = agentQueryWrapper();
    render(<RunList />, { wrapper: Wrapper });
    expect(await screen.findByText("No runs in this workspace")).toBeInTheDocument();
    expect(screen.getByText(/Assign an exact goal in Agent tasks/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run agent/i })).not.toBeInTheDocument();
  });
  it("shows loading until real run data arrives", async () => {
    let resolve!: (value: typeof runFixture[]) => void;
    vi.mocked(api.agentRuns).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { Wrapper } = agentQueryWrapper();
    render(<RunList />, { wrapper: Wrapper });
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    await act(async () => resolve([runFixture]));
    expect((await screen.findAllByRole("link", { name: new RegExp(runFixture.goal) })).length).toBeGreaterThan(0);
  });
  it("explains denied access without substituting demo records", async () => {
    vi.mocked(api.agentRuns).mockRejectedValue(new ApiError("Denied", 403));
    const { Wrapper } = agentQueryWrapper();
    render(<RunList />, { wrapper: Wrapper });
    expect(await screen.findByText("Access restricted")).toBeInTheDocument();
    expect(screen.queryByText("Synthetic run history")).not.toBeInTheDocument();
  });
  it("keys requests by tenant and clears previous records on a tenant switch", async () => {
    vi.mocked(api.agentRuns).mockImplementation(async (org) => org === "org-1" ? [runFixture] : []);
    const { Wrapper } = agentQueryWrapper();
    const { rerender } = render(<RunList />, { wrapper: Wrapper });
    expect((await screen.findAllByRole("link", { name: new RegExp(runFixture.goal) })).length).toBeGreaterThan(0);
    workspace.activeOrganization = { id: "org-2" };
    rerender(<RunList />);
    expect(await screen.findByText("No runs in this workspace")).toBeInTheDocument();
    expect(screen.queryAllByRole("link", { name: new RegExp(runFixture.goal) })).toHaveLength(0);
    await waitFor(() => expect(api.agentRuns).toHaveBeenCalledWith("org-2", 50, expect.any(AbortSignal)));
  });

  it("keeps run access separate from credential administration and marks Runs current", async () => {
    vi.mocked(api.agentRuns).mockResolvedValue([runFixture]);
    const { Wrapper } = agentQueryWrapper(); render(<RunList />, { wrapper: Wrapper });
    await screen.findAllByText(runFixture.goal);
    const nav = screen.getByRole("navigation", { name: "Agents sections" });
    expect(within(nav).getByRole("link", { name: "Credentials" })).toHaveAttribute("href", "/agents");
    expect(within(nav).getByRole("link", { name: "Runs" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { level: 1, name: "Agents" })).toBeInTheDocument();
    expect(api.agentRuns).toHaveBeenCalledWith("org-1", 50, expect.any(AbortSignal));
    expect(screen.queryByText("Administrator access required")).not.toBeInTheDocument();
  });

  it("keeps a long full goal and UUID accessible with the original detail destination", async () => {
    const id = "61a7a27d-b5e8-4736-aa11-b235d0c4d92f";
    const goal = "Inspect the approved retained source and record an assigned follow-up without changing the original permissions. ".repeat(12).trim();
    vi.mocked(api.agentRuns).mockResolvedValue([{ ...runFixture, id, goal }]);
    const { Wrapper } = agentQueryWrapper(); render(<RunList />, { wrapper: Wrapper });
    const links = await screen.findAllByRole("link", { name: /Inspect the approved retained source/ });
    for (const link of links) {
      expect(link).toHaveAttribute("href", `/runs/${id}`);
      expect(within(link).getByTitle(goal)).toHaveTextContent(goal.trim());
      expect(within(link).getByTitle(id)).toHaveTextContent("61a7a27d");
      expect(within(link).getByText(`Full run ID: ${id}`)).toBeInTheDocument();
    }
    expect(screen.getAllByText("External agent").length).toBeGreaterThan(0);
  });

  it("preserves deadline/status sorting and terminal unknown-outcome warnings", async () => {
    vi.mocked(api.agentRuns).mockResolvedValue([
      { ...runFixture, id: "later", goal: "Later deadline", status: "succeeded", deadline_at: "2099-11-03T00:00:00Z" },
      { ...runFixture, id: "unknown", goal: "Unverified remote outcome", status: "failed", error_code: "unknown_outcome", deadline_at: "2099-11-01T00:00:00Z" },
    ]);
    const { Wrapper } = agentQueryWrapper(); render(<RunList />, { wrapper: Wrapper });
    await screen.findAllByText("Later deadline");
    const table = screen.getByRole("table", { name: "Agent runs" });
    fireEvent.click(within(table).getByRole("button", { name: "Run deadline" }));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Unverified remote outcome");
    expect(within(table).getByRole("columnheader", { name: "Run deadline" })).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(within(table).getByRole("button", { name: "Status" }));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Failed");
    expect(within(table).getByText("Outcome unknown")).toBeInTheDocument();
    expect(screen.getByText(/Unknown outcomes may have remote effects/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry|Run again/ })).not.toBeInTheDocument();
  });

  it("only expands the bounded query from 50 to 100 on explicit request", async () => {
    vi.mocked(api.agentRuns).mockResolvedValue(Array.from({ length: 50 }, (_, i) => ({ ...runFixture, id: `run-${i}` })));
    const { Wrapper } = agentQueryWrapper(); render(<RunList />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Show up to 100 recent runs" }));
    await waitFor(() => expect(api.agentRuns).toHaveBeenCalledWith("org-1", 100, expect.any(AbortSignal)));
    expect(screen.queryByRole("button", { name: "Show up to 100 recent runs" })).not.toBeInTheDocument();
    expect(vi.mocked(api.agentRuns).mock.calls.every(([, limit]) => limit === 50 || limit === 100)).toBe(true);
  });

  it("does not introduce idle polling for terminal records", async () => {
    vi.useFakeTimers();
    vi.mocked(api.agentRuns).mockResolvedValue([{ ...runFixture, status: "succeeded" }]);
    const { Wrapper } = agentQueryWrapper(); render(<RunList />, { wrapper: Wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(api.agentRuns).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(api.agentRuns).toHaveBeenCalledTimes(1);
  });
});
