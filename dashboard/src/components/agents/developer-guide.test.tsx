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
});
