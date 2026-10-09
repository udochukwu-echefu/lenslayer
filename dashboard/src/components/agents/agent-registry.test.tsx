import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import type { AgentCreated } from "@/lib/agent-types";
import type { Role } from "@/lib/types";
import { agentFixture, contractFixture, memberFixture } from "@/test/agent-fixtures";
import { agentQueryWrapper } from "@/test/agent-query-wrapper";
import { AgentRegistry } from "./agent-registry";

const workspace = vi.hoisted(() => ({ activeOrganization: { id: "org-1" }, activeRole: "owner" as Role | null, isDemo: false }));
vi.mock("../workspace-provider", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", async () => {
  const { ApiError } = await import("@/lib/api/client");
  return { ApiError, api: { agents: vi.fn(), createAgent: vi.fn(), revokeAgent: vi.fn(), contracts: vi.fn(), members: vi.fn() } };
});

const token = "ll_agent_component_test_only";
beforeEach(() => {
  workspace.activeOrganization = { id: "org-1" };
  workspace.activeRole = "owner";
  workspace.isDemo = false;
  vi.mocked(api.agents).mockReset().mockResolvedValue([agentFixture]);
  vi.mocked(api.createAgent).mockReset().mockResolvedValue({ agent: agentFixture, token });
  vi.mocked(api.revokeAgent).mockReset().mockResolvedValue({ ...agentFixture, status: "revoked" });
  vi.mocked(api.contracts).mockReset().mockResolvedValue([contractFixture]);
  vi.mocked(api.members).mockReset().mockResolvedValue([memberFixture]);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => vi.restoreAllMocks());

async function fillCreation() {
  fireEvent.click(screen.getByRole("button", { name: "Create agent" }));
  const contract = await screen.findByRole("checkbox", { name: /Retained supplier contract/ });
  fireEvent.click(contract);
  fireEvent.click(screen.getByRole("checkbox", { name: /Workspace owner/ }));
  fireEvent.change(screen.getByLabelText("Agent name"), { target: { value: "Renewal assistant" } });
  fireEvent.change(screen.getByLabelText("Expiry (your local time)"), { target: { value: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16) } });
}

describe("agent administration and one-time credential", () => {
  it("creates calendar-only scope without task targets and shows exact calendar grants", async () => {
    vi.mocked(api.agents).mockResolvedValue([{ ...agentFixture, contract_ids: [], assignee_ids: [], allowed_tools: ["google_calendar.events.create"], calendar_targets: [{ connection_id: "connection-1", calendar_id: "sandbox@example.test" }] }]);
    const { Wrapper } = agentQueryWrapper(); render(<AgentRegistry />, { wrapper: Wrapper });
    expect(await screen.findByText("sandbox@example.test")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));
    await screen.findByRole("checkbox", { name: /Retained supplier contract/ });
    fireEvent.click(screen.getByRole("checkbox", { name: /Retrieve retained source evidence/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Create an assigned follow-up task/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Create a private timed calendar event/ }));
    fireEvent.change(screen.getByLabelText("Agent name"), { target: { value: "Calendar assistant" } });
    fireEvent.change(screen.getByLabelText("Expiry (your local time)"), { target: { value: new Date(Date.now() + 86400000).toISOString().slice(0, 16) } });
    fireEvent.change(screen.getByLabelText("Calendar OAuth connection ID"), { target: { value: "connection-1" } });
    fireEvent.change(screen.getByLabelText("Calendar ID"), { target: { value: "sandbox@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Create agent credential" }));
    await waitFor(() => expect(api.createAgent).toHaveBeenCalledWith("org-1", expect.objectContaining({ contract_ids: [], assignee_ids: [], allowed_tools: ["google_calendar.events.create"], calendar_targets: [{ connection_id: "connection-1", calendar_id: "sandbox@example.test" }], require_approval: true }), expect.any(AbortSignal)));
  });
  it.each(["viewer", "reviewer", null] as const)("does not request delegations or expose mutations for %s", (role) => {
    workspace.activeRole = role;
    const { Wrapper } = agentQueryWrapper();
    render(<AgentRegistry />, { wrapper: Wrapper });
    expect(screen.getByText("Administrator access required")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create agent" })).not.toBeInTheDocument();
    expect(api.agents).not.toHaveBeenCalled();
  });
  it.each(["viewer", "reviewer", null] as const)("hides cached delegations after a role change to %s", async (role) => {
    const { client, Wrapper } = agentQueryWrapper();
    const { rerender } = render(<AgentRegistry />, { wrapper: Wrapper });
    expect(await screen.findByText(agentFixture.name)).toBeInTheDocument();
    expect(client.getQueryData(["agents", "org-1"])).toEqual([agentFixture]);
    vi.mocked(api.agents).mockClear();
    workspace.activeRole = role;
    rerender(<AgentRegistry />);
    expect(screen.getByText("Administrator access required")).toBeInTheDocument();
    expect(screen.queryByText(agentFixture.name)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create agent|Revoke/ })).not.toBeInTheDocument();
    expect(api.agents).not.toHaveBeenCalled();
  });
  it("hides cached delegations and creation controls after a denied refetch", async () => {
    const { client, Wrapper } = agentQueryWrapper();
    render(<AgentRegistry />, { wrapper: Wrapper });
    expect(await screen.findByText(agentFixture.name)).toBeInTheDocument();
    vi.mocked(api.agents).mockRejectedValue(new ApiError("Administrator role revoked", 403));
    await act(async () => { await client.invalidateQueries({ queryKey: ["agents", "org-1"] }); });
    expect(await screen.findByText("Access restricted")).toBeInTheDocument();
    expect(screen.queryByText(agentFixture.name)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create agent|Revoke/ })).not.toBeInTheDocument();
  });
  it("shows synthetic records as illustrations and never offers a credential", async () => {
    workspace.activeOrganization = { id: "public-workspace" };
    workspace.isDemo = true;
    const { Wrapper } = agentQueryWrapper();
    render(<AgentRegistry />, { wrapper: Wrapper });
    expect(screen.getByText(/Synthetic execution example/)).toBeInTheDocument();
    expect(await screen.findByText("Renewal assistant")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create agent" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revoke/ })).not.toBeInTheDocument();
  });
  it("shows and copies a new credential once without storing it in caches, storage, or logs", async () => {
    const { client, Wrapper } = agentQueryWrapper();
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    render(<AgentRegistry />, { wrapper: Wrapper });
    await fillCreation();
    fireEvent.click(screen.getByRole("button", { name: "Create agent credential" }));
    expect(await screen.findByLabelText("Agent bearer credential")).toHaveValue(token);
    expect(api.createAgent).toHaveBeenCalledWith("org-1", expect.objectContaining({ contract_ids: ["contract-1"], assignee_ids: ["user-1"], require_approval: true, max_actions_per_run: 1 }), expect.any(AbortSignal));
    fireEvent.click(screen.getByRole("button", { name: "Copy credential" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(token);
    expect(JSON.stringify(client.getMutationCache().getAll().map((item) => item.state))).not.toContain(token);
    expect(JSON.stringify(client.getQueryCache().getAll().map((item) => item.state.data))).not.toContain(token);
    expect(JSON.stringify(storage.mock.calls)).not.toContain(token);
    for (const log of logs) expect(JSON.stringify(log.mock.calls)).not.toContain(token);
    fireEvent.click(screen.getByRole("button", { name: "I saved it. Dismiss" }));
    expect(screen.queryByDisplayValue(token)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create agent" })).toBeInTheDocument();
  });
  it("clears a displayed credential immediately when switching workspace", async () => {
    const { client, Wrapper } = agentQueryWrapper();
    const { rerender } = render(<AgentRegistry />, { wrapper: Wrapper });
    await fillCreation();
    fireEvent.click(screen.getByRole("button", { name: "Create agent credential" }));
    expect(await screen.findByDisplayValue(token)).toBeInTheDocument();
    workspace.activeOrganization = { id: "org-2" };
    rerender(<AgentRegistry />);
    expect(screen.queryByDisplayValue(token)).not.toBeInTheDocument();
    await waitFor(() => expect(api.agents).toHaveBeenCalledWith("org-2", expect.any(AbortSignal)));
    expect(JSON.stringify(client.getMutationCache().getAll().map((item) => item.state))).not.toContain(token);
  });
  it("does not reveal a late credential response from the previous workspace", async () => {
    let resolve!: (result: AgentCreated) => void;
    vi.mocked(api.createAgent).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { Wrapper } = agentQueryWrapper();
    const { rerender } = render(<AgentRegistry />, { wrapper: Wrapper });
    await fillCreation();
    fireEvent.click(screen.getByRole("button", { name: "Create agent credential" }));
    await waitFor(() => expect(api.createAgent).toHaveBeenCalledOnce());
    const signal = vi.mocked(api.createAgent).mock.calls[0][2]!;
    workspace.activeOrganization = { id: "org-2" };
    rerender(<AgentRegistry />);
    expect(signal.aborted).toBe(true);
    await act(async () => resolve({ agent: agentFixture, token }));
    expect(screen.queryByDisplayValue(token)).not.toBeInTheDocument();
  });
  it("clears credentials on page navigation and tab hiding", async () => {
    const { Wrapper } = agentQueryWrapper();
    const { unmount } = render(<AgentRegistry />, { wrapper: Wrapper });
    await fillCreation();
    fireEvent.click(screen.getByRole("button", { name: "Create agent credential" }));
    expect(await screen.findByDisplayValue(token)).toBeInTheDocument();
    fireEvent(window, new Event("pagehide"));
    expect(screen.queryByDisplayValue(token)).not.toBeInTheDocument();
    unmount();
    expect(screen.queryByDisplayValue(token)).not.toBeInTheDocument();
  });
  it("requires an explicit revocation confirmation and warns about completed effects", async () => {
    const { Wrapper } = agentQueryWrapper();
    render(<AgentRegistry />, { wrapper: Wrapper });
    fireEvent.click(await screen.findByRole("button", { name: "Revoke Renewal assistant" }));
    expect(screen.getByText(/Already-created tasks remain/)).toBeInTheDocument();
    expect(api.revokeAgent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm revocation" }));
    await waitFor(() => expect(api.revokeAgent).toHaveBeenCalledWith("org-1", "agent-1"));
  });
});
