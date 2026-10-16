import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import AgentsPage from "./page";
import AgentRunsPage from "./runs/page";
import LegacyRunsPage from "../runs/page";
import RunDetailPage from "../runs/[runId]/page";

vi.mock("@/components/agents/agent-registry", () => ({ AgentRegistry: () => <p>Credential registry route</p> }));
vi.mock("@/components/agents/run-list", () => ({ RunList: () => <p>Run history route</p> }));
vi.mock("@/components/agents/run-detail", () => ({ RunDetail: ({ runId }: { runId: string }) => <p>Run detail {runId}</p> }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); }) }));

describe("Agents route contract", () => {
  it("keeps /agents as the credential registry", () => {
    render(<AgentsPage />);
    expect(screen.getByText("Credential registry route")).toBeInTheDocument();
  });
  it("mounts run history at /agents/runs", () => {
    render(<AgentRunsPage />);
    expect(screen.getByText("Run history route")).toBeInTheDocument();
  });
  it("redirects only the old listing to /agents/runs", () => {
    expect(() => LegacyRunsPage()).toThrow("NEXT_REDIRECT:/agents/runs");
    expect(redirect).toHaveBeenCalledWith("/agents/runs");
  });
  it("preserves /runs/[runId] deep links and the full identifier", async () => {
    const id = "61a7a27d-b5e8-4736-aa11-b235d0c4d92f";
    render(await RunDetailPage({ params: Promise.resolve({ runId: id }) }));
    expect(screen.getByText(`Run detail ${id}`)).toBeInTheDocument();
  });
});
