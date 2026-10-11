import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { actionFixture, evidenceFixture, runFixture } from "@/test/agent-fixtures";
import { agentQueryWrapper } from "@/test/agent-query-wrapper";
import type { Role } from "@/lib/types";
import { ActionReview } from "./action-review";

const workspace = vi.hoisted(() => ({ activeRole: "owner" as Role | null, isDemo: false }));
vi.mock("../workspace-provider", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", async () => {
  const { ApiError } = await import("@/lib/api/client");
  return { ApiError, api: { decideAgentAction: vi.fn(), agentRunEvidence: vi.fn() } };
});
beforeEach(() => {
  workspace.activeRole = "owner";
  workspace.isDemo = false;
  vi.mocked(api.decideAgentAction).mockReset().mockResolvedValue({ ...actionFixture, status: "queued", approval_status: "approved" });
  vi.mocked(api.agentRunEvidence).mockReset().mockResolvedValue(evidenceFixture);
});
afterEach(() => vi.useRealTimers());

function review(action = actionFixture, run = runFixture) {
  const { Wrapper } = agentQueryWrapper();
  return render(<ActionReview organizationId="org-1" run={run} action={action} events={[]} />, { wrapper: Wrapper });
}

describe("immutable task approval", () => {
  it("shows the exact target, due instant, receipt, binding hash, and expiry", () => {
    review();
    expect(screen.getByText("contract-1")).toBeInTheDocument();
    expect(screen.getByText("user-1")).toBeInTheDocument();
    expect(screen.getByText(actionFixture.input.due_at)).toBeInTheDocument();
    expect(screen.getByText("receipt-1")).toBeInTheDocument();
    expect(screen.getByText(actionFixture.input_sha256)).toBeInTheDocument();
    expect(screen.getByText("Approval expiry")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve exact task" })).toBeDisabled();
  });
  it.each(["approved", "rejected"] as const)("submits a human %s decision with a reason, not changed input", async (decision) => {
    review();
    fireEvent.change(screen.getByLabelText("Approval or rejection reason"), { target: { value: "Checked source and assignment" } });
    fireEvent.click(screen.getByRole("button", { name: decision === "approved" ? "Approve exact task" : "Reject task" }));
    await waitFor(() => expect(api.decideAgentAction).toHaveBeenCalledWith("org-1", "run-1", "action-1", { decision, reason: "Checked source and assignment" }));
  });
  it.each(["reviewer", "viewer", null] as const)("does not expose approval controls to %s", (role) => {
    workspace.activeRole = role;
    review();
    expect(screen.queryByRole("button", { name: "Approve exact task" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject task" })).not.toBeInTheDocument();
  });
  it.each(["queued", "running", "succeeded", "failed", "cancelled"] as const)("does not expose a decision for %s actions", (status) => {
    review({ ...actionFixture, status });
    expect(screen.queryByRole("button", { name: "Approve exact task" })).not.toBeInTheDocument();
  });
  it("does not expose mutation controls in synthetic mode, even for owners", () => {
    workspace.isDemo = true;
    review();
    expect(screen.queryByRole("button", { name: "Approve exact task" })).not.toBeInTheDocument();
    expect(screen.getByText("Synthetic demo: decisions are disabled.")).toBeInTheDocument();
  });
  it("removes approval controls as soon as the approval binding expires", () => {
    vi.useFakeTimers();
    const expiry = Date.now() + 1000;
    review({ ...actionFixture, approval_expires_at: new Date(expiry).toISOString() });
    expect(screen.getByRole("button", { name: "Approve exact task" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1001));
    expect(screen.queryByRole("button", { name: "Approve exact task" })).not.toBeInTheDocument();
    expect(screen.getByText(/approval window expired/)).toBeInTheDocument();
  });
  it("loads real retained evidence only when explicitly opened", async () => {
    review();
    expect(api.agentRunEvidence).not.toHaveBeenCalled();
    const details = screen.getByText("Inspect retained evidence receipt").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(await screen.findByText(evidenceFixture.excerpt)).toBeInTheDocument();
    expect(api.agentRunEvidence).toHaveBeenCalledWith("org-1", "run-1", "receipt-1", expect.any(AbortSignal));
  });
  it("explains an unavailable receipt without substituting synthetic evidence", async () => {
    vi.mocked(api.agentRunEvidence).mockRejectedValue(new Error("The retained source is unavailable."));
    review();
    const details = screen.getByText("Inspect retained evidence receipt").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(await screen.findByText("The retained source is unavailable.")).toBeInTheDocument();
    expect(screen.queryByText(evidenceFixture.excerpt)).not.toBeInTheDocument();
  });
  it("distinguishes a missing evidence receipt from a missing run", async () => {
    vi.mocked(api.agentRunEvidence).mockRejectedValue(new ApiError("Evidence receipt not found", 404));
    review();
    const details = screen.getByText("Inspect retained evidence receipt").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(await screen.findByText("Evidence unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Run unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText(evidenceFixture.excerpt)).not.toBeInTheDocument();
  });
  it("removes a cached excerpt when retention is no longer available on refresh", async () => {
    review();
    const details = screen.getByText("Inspect retained evidence receipt").closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(await screen.findByText(evidenceFixture.excerpt)).toBeInTheDocument();
    vi.mocked(api.agentRunEvidence).mockRejectedValue(new Error("The source text was removed."));
    fireEvent.click(screen.getByRole("button", { name: "Refresh evidence" }));
    expect(await screen.findByText("The source text was removed.")).toBeInTheDocument();
    expect(screen.queryByText(evidenceFixture.excerpt)).not.toBeInTheDocument();
  });
});
