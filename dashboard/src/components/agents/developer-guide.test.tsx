import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeveloperGuide } from "./developer-guide";

const state = vi.hoisted(() => ({ activeRole: "owner", isDemo: false, isLoading: false, error: null as Error | null, activeOrganization: { id: "org" }, canUpload: true }));
vi.mock("../workspace-provider", () => ({ useWorkspace: () => state }));

describe("developer onboarding access boundaries", () => {
  beforeEach(() => { Object.assign(state, { activeRole: "owner", isDemo: false, isLoading: false, error: null, activeOrganization: { id: "org" }, canUpload: true }); });
  it("offers actual owner routes but no bearer input/storage surface", () => {
    const { container } = render(<DeveloperGuide />);
    expect(screen.getByRole("link", { name: "Manage scoped agents" })).toHaveAttribute("href", "/agents");
    expect(screen.getByRole("link", { name: "Assign a hosted goal" })).toHaveAttribute("href", "/agent-tasks");
    expect(screen.getByRole("link", { name: "Upload a retained source" })).toHaveAttribute("href", "/contracts/new");
    expect(container.querySelector("input, textarea")).toBeNull();
  });
  it("embeds without a second public header/main and uses canonical settings and run links", () => {
    const { container } = render(<DeveloperGuide embedded />);
    expect(container.querySelector("main, .developer-nav")).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getByRole("link", { name: "Inspect runs" })).toHaveAttribute("href", "/agents/runs");
    expect(screen.getByRole("link", { name: "Calendar settings" })).toHaveAttribute("href", "/settings/integrations#calendar-connection");
    expect(screen.getByText(/Agent credentials cannot call human approval routes/)).toBeInTheDocument();
  });
  it("ties optional model sharing to server disclosure and acknowledgement without hardcoding a provider", () => {
    render(<DeveloperGuide />);
    const hostedGuide = screen.getByRole("region", { name: "Let LensLayer prepare the proposals" });
    expect(hostedGuide).toHaveTextContent("Default planning is a fixed workflow with no model call.");
    expect(hostedGuide).toHaveTextContent("Optional model assistance appears only when enabled by the service and requires explicit acknowledgement that your goal, exact scoped facts and any retained excerpt will be shared with the provider and model identified in the server disclosure.");
    expect(hostedGuide).toHaveTextContent("no agent credential enters the browser");
    expect(hostedGuide).toHaveTextContent("approve exact actions and inspect each verified receipt");
    expect(hostedGuide).not.toHaveTextContent(/OpenAI|GPT-6\.1 Sol|DeepSeek|deepseek-flash/i);
  });
  it("does not offer credential creation in demo mode", () => {
    state.isDemo = true;
    render(<DeveloperGuide />);
    expect(screen.getByText(/The public walkthrough is synthetic/)).toBeInTheDocument();
    expect(screen.queryByText("Manage scoped agents")).toBeNull();
    expect(screen.queryByText("Upload a retained source")).toBeNull();
  });
  it("keeps viewer inspection separate from approval", () => {
    state.activeRole = "viewer"; state.canUpload = false;
    render(<DeveloperGuide />);
    expect(screen.getByText(/Your role can inspect run records/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inspect agent access" })).toHaveAttribute("href", "/agents");
  });
  it("keeps docs readable during loading and access failure", () => {
    state.isLoading = true;
    const { rerender } = render(<DeveloperGuide />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    state.isLoading = false; state.error = new Error("unavailable");
    rerender(<DeveloperGuide />);
    expect(screen.getByRole("alert")).toHaveTextContent("Workspace access could not be loaded");
    expect(screen.getByRole("heading", { name: "5. Check the verified receipt" })).toBeInTheDocument();
  });
  it("documents pre-run hits, immutable context graphs and factual/scheduling limits without a human create form", () => {
    const { container } = render(<DeveloperGuide />);
    expect(screen.getByRole("heading", { name: "Context-backed workflow graphs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Search before fixing a plan" })).toBeInTheDocument();
    expect(screen.getByText(/Planning hits include a context\/version\/hash/)).toBeInTheDocument();
    expect(screen.getByText(/no graph-creation form or invented human creation route/)).toBeInTheDocument();
    expect(container.querySelector("input, textarea")).toBeNull();
  });
});
