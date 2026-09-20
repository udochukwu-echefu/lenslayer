import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiAssistant } from "./ai-assistant";
import { api } from "@/lib/api";
import type { PortfolioAnswer } from "@/lib/types";

const workspace = vi.hoisted(() => ({ activeOrganization: { id: "workspace-a" } }));
vi.mock("./workspace-provider", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", () => ({ api: { askPortfolio: vi.fn() } }));

beforeEach(() => {
  workspace.activeOrganization = { id: "workspace-a" };
  vi.mocked(api.askPortfolio).mockReset();
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

function askQuestion() {
  fireEvent.click(screen.getByRole("button", { name: "Ask LensLayer AI" }));
  fireEvent.change(screen.getByLabelText("Ask across this workspace"), { target: { value: "Private renewal terms?" } });
  fireEvent.click(screen.getByRole("button", { name: "Send question" }));
}

function switchWorkspace(rerender: (ui: React.ReactNode) => void) {
  workspace.activeOrganization = { id: "workspace-b" };
  rerender(<AiAssistant />);
  if (!screen.queryByLabelText("Ask across this workspace")) {
    fireEvent.click(screen.getByRole("button", { name: "Ask LensLayer AI" }));
  }
}

const question = "Private renewal terms?";
const answer: PortfolioAnswer = { answer: "Workspace A confidential terms", generated_by: "extractive", sources: [] };

describe("AI assistant workspace isolation", () => {
  it("clears the previous workspace conversation when switching workspaces", async () => {
    vi.mocked(api.askPortfolio).mockResolvedValue(answer);
    const { rerender } = render(<AiAssistant />);
    askQuestion();
    expect(await screen.findByText(answer.answer)).toBeInTheDocument();
    switchWorkspace(rerender);
    expect(screen.queryByText(answer.answer)).not.toBeInTheDocument();
    expect(screen.queryByText(question)).not.toBeInTheDocument();
  });

  it("does not append a late answer from the previous workspace", async () => {
    let resolve!: (answer: PortfolioAnswer) => void;
    vi.mocked(api.askPortfolio).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { rerender } = render(<AiAssistant />);
    askQuestion();
    expect(api.askPortfolio).toHaveBeenCalledWith("workspace-a", question);
    switchWorkspace(rerender);
    await act(async () => { resolve(answer); });
    expect(screen.queryByText(answer.answer)).not.toBeInTheDocument();
    expect(screen.getByText("Start with your agreements")).toBeInTheDocument();
  });
});
