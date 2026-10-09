import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
});
