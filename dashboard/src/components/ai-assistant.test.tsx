import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiAssistant } from "./ai-assistant";
import { streamQuestion, type QAEvent } from "@/lib/api/qa-stream";
import type { PortfolioAnswer } from "@/lib/types";

const workspace = vi.hoisted(() => ({
  activeOrganization: { id: "workspace-a" },
}));
vi.mock("./workspace-provider", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api/qa-stream", () => ({ streamQuestion: vi.fn() }));

beforeEach(() => {
  workspace.activeOrganization = { id: "workspace-a" };
  vi.mocked(streamQuestion).mockReset();
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

function askQuestion() {
  fireEvent.click(screen.getByRole("button", { name: "Ask LensLayer AI" }));
  fireEvent.change(screen.getByLabelText("Ask across this workspace"), {
    target: { value: "Private renewal terms?" },
  });
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
const answer: PortfolioAnswer = {
  answer: "Workspace A confidential terms",
  generated_by: "extractive",
  sources: [],
};

describe("AI assistant workspace isolation", () => {
  it("shows completed answers immediately without a simulated streaming delay", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    let resolve!: (answer: PortfolioAnswer) => void;
    vi.mocked(streamQuestion).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<AiAssistant />);
    askQuestion();
    const completed = {
      ...answer,
      answer: "An evidence-backed answer. ".repeat(50),
    };
    await act(async () => {
      resolve(completed);
    });
    expect(screen.getByText(completed.answer.trim())).toBeInTheDocument();
    expect(
      screen.queryByText("Writing supported answer"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ask across this workspace"), {
      target: { value: "Next question?" },
    });
    expect(screen.getByRole("button", { name: "Send question" })).toBeEnabled();
  });

  it("clears the previous workspace conversation when switching workspaces", async () => {
    vi.mocked(streamQuestion).mockResolvedValue(answer);
    const { rerender } = render(<AiAssistant />);
    askQuestion();
    expect(await screen.findByText(answer.answer)).toBeInTheDocument();
    switchWorkspace(rerender);
    expect(screen.queryByText(answer.answer)).not.toBeInTheDocument();
    expect(screen.queryByText(question)).not.toBeInTheDocument();
  });

  it("does not append a late answer from the previous workspace", async () => {
    let resolve!: (answer: PortfolioAnswer) => void;
    vi.mocked(streamQuestion).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { rerender } = render(<AiAssistant />);
    askQuestion();
    expect(streamQuestion).toHaveBeenCalledWith("/organizations/workspace-a/portfolio/questions", question, expect.any(Function), expect.any(AbortSignal), undefined);
    const signal = vi.mocked(streamQuestion).mock.calls[0][3];
    switchWorkspace(rerender);
    expect(signal.aborted).toBe(true);
    await act(async () => {
      resolve(answer);
    });
    expect(screen.queryByText(answer.answer)).not.toBeInTheDocument();
    expect(screen.getByText("Start with your agreements")).toBeInTheDocument();
  });

  it("renders provisional content before completion and stops the request on close", async () => {
    let onEvent!: (event: QAEvent) => void;
    vi.mocked(streamQuestion).mockImplementation((_path, _question, callback) => {
      onEvent = callback;
      return new Promise(() => {});
    });
    render(<AiAssistant />);
    askQuestion();
    act(() => onEvent({ type: "answer", request_id: "r", seq: 1, delta: "Provisional notice", provisional: true }));
    expect(screen.getByText("Provisional notice")).toBeInTheDocument();
    expect(screen.getByText("Provisional answer, not yet verified")).toBeInTheDocument();
    expect(screen.queryByText("Context used")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close AI assistant" }));
    expect(vi.mocked(streamQuestion).mock.calls[0][3].aborted).toBe(true);
  });
});
