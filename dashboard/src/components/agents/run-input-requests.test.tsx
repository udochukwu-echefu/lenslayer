import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { InputRequest } from "@/lib/agent-types";
import { runFixture } from "@/test/agent-fixtures";
import { agentQueryWrapper } from "@/test/agent-query-wrapper";
import { RunInputRequests } from "./run-input-requests";

const workspace = vi.hoisted(() => ({ activeRole: "owner", isDemo: false }));
vi.mock("../workspace-provider", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", () => ({ api: { agentInputRequests: vi.fn(), supplyAgentRunInput: vi.fn() } }));
const request: InputRequest = { id: "input-1", run_id: "run-1", request: { idempotency_key: "facts", reason: "Confirm factual notice days", expires_at: "2099-10-31T00:00:00Z", responder: "human", fields: [{ name: "notice_days", type: "integer", prompt: "Calendar days of notice" }] }, status: "pending", values: {}, supplied_by_agent_id: null, supplied_by_user_id: null, supplied_at: null, created_at: "2026-01-01T00:00:00Z" };
function show() { const { Wrapper } = agentQueryWrapper(); return render(<RunInputRequests organizationId="org-1" run={{ ...runFixture, status: "awaiting_input" }} />, { wrapper: Wrapper }); }
beforeEach(() => { workspace.activeRole = "owner"; workspace.isDemo = false; vi.mocked(api.agentInputRequests).mockReset().mockResolvedValue([request]); vi.mocked(api.supplyAgentRunInput).mockReset().mockResolvedValue({ ...request, status: "supplied" }); });
it("awaiting_input is a factual wait and sends typed values, never approval", async () => {
  show(); fireEvent.change(await screen.findByLabelText("Calendar days of notice"), { target: { value: "30" } });
  fireEvent.click(screen.getByRole("button", { name: "Supply exact facts" }));
  await waitFor(() => expect(api.supplyAgentRunInput).toHaveBeenCalledWith("org-1", "run-1", "input-1", { values: { notice_days: 30 } }));
  expect(screen.getByText(/Supplying facts does not change scope/)).toBeInTheDocument();
});
it("rejects credential collection fields and disables supply for read-only/demo users", async () => {
  vi.mocked(api.agentInputRequests).mockResolvedValue([{ ...request, request: { ...request.request, fields: [{ name: "api_token", type: "text", prompt: "Secret" }] } }]);
  const first = show(); expect(await screen.findByText(/credential-like input fields/)).toBeInTheDocument(); expect(screen.queryByLabelText("Secret")).toBeNull(); first.unmount();
  vi.mocked(api.agentInputRequests).mockResolvedValue([request]); workspace.isDemo = true;
  show(); expect(await screen.findByText(request.request.reason)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Supply exact facts" })).toBeNull();
});
it("fetches immutable supplied history on a fresh terminal run page", async () => {
  vi.mocked(api.agentInputRequests).mockResolvedValue([{ ...request, status: "supplied", values: { notice_days: 30 }, supplied_by_user_id: "user-1" }]);
  const { Wrapper } = agentQueryWrapper(); render(<RunInputRequests organizationId="org-1" run={{ ...runFixture, status: "succeeded" }} />, { wrapper: Wrapper });
  expect(await screen.findByText("Immutable supplied facts")).toBeInTheDocument();
  expect(screen.getByText(/"notice_days": 30/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Supply exact facts" })).toBeNull();
  expect(screen.queryByText(/The run is waiting, not terminal/)).toBeNull();
});
it("refreshes supplied facts when the run leaves the wait state", async () => {
  const { Wrapper } = agentQueryWrapper();
  const view = render(<RunInputRequests organizationId="org-1" run={{ ...runFixture, status: "awaiting_input" }} />, { wrapper: Wrapper });
  fireEvent.change(await screen.findByLabelText("Calendar days of notice"), { target: { value: "30" } });
  vi.mocked(api.agentInputRequests).mockResolvedValue([{ ...request, status: "supplied", values: { notice_days: 30 } }]);
  fireEvent.click(screen.getByRole("button", { name: "Supply exact facts" }));
  view.rerender(<RunInputRequests organizationId="org-1" run={{ ...runFixture, status: "running" }} />);
  expect(await screen.findByText("Immutable supplied facts")).toBeInTheDocument();
  expect(screen.getByText(/"notice_days": 30/)).toBeInTheDocument();
  expect(api.agentInputRequests).toHaveBeenCalledTimes(2);
});
it("fetches input history on running task runs too", async () => {
  vi.mocked(api.agentInputRequests).mockResolvedValue([]);
  const { Wrapper } = agentQueryWrapper(); render(<RunInputRequests organizationId="org-1" run={{ ...runFixture, status: "running" }} />, { wrapper: Wrapper });
  await waitFor(() => expect(api.agentInputRequests).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.queryByText("Typed factual input")).toBeNull());
});
