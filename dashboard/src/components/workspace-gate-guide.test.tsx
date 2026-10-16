import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { SettingsWorkspace } from "./settings/settings-workspace";
import { SettingsSection } from "./settings/settings-section";
import { WorkspaceGate } from "./workspace-gate";
import type { SettingsSectionId } from "./settings/sections";

const state = vi.hoisted(() => ({
  pathname: "/settings/developers", publicAccess: false,
  sessionStatus: "authenticated" as "authenticated" | "loading" | "unauthenticated",
  sessionError: undefined as string | undefined,
  organizations: [{ id: "org-1" }] as { id: string }[],
  activeOrganization: { id: "org-1", name: "Northstar", slug: "northstar", role: "owner", created_at: "2026-10-01T09:00:00Z" } as { id: string; name: string; slug: string; role: string; created_at: string } | null,
  user: { id: "user-1", email: "owner@example.test", display_name: "Owner" } as { id: string; email: string; display_name: string } | null,
  activeRole: "owner" as string | null, canManageTeam: true, canUpload: true, isDemo: false,
  isLoading: false, error: null as Error | null,
}));
const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
const createWorkspace = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false, error: null }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => navigation }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: state.sessionStatus,
  data: state.sessionStatus === "authenticated" ? { error: state.sessionError } : null }) }));
vi.mock("./workspace-provider", () => ({ useWorkspace: () => state, useCreateWorkspace: () => createWorkspace }));
vi.mock("@/lib/api", async () => {
  const { ApiError } = await import("@/lib/api/client");
  return { ApiError, isPublicAccessEnabled: () => state.publicAccess, api: {
    organizationSettings: vi.fn(), updateOrganizationSettings: vi.fn(), apiKeys: vi.fn(),
    integrations: vi.fn(), integrationProviders: vi.fn(), intakeEmailAddress: vi.fn(),
    integrationImports: vi.fn(), webhooks: vi.fn(), webhookDeliveries: vi.fn(),
    createApiKey: vi.fn(), createIntegration: vi.fn(), createWebhook: vi.fn(),
  } };
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { pathname: "/settings/developers", publicAccess: false, sessionStatus: "authenticated",
    sessionError: undefined, organizations: [{ id: "org-1" }], isLoading: false, error: null,
    activeOrganization: { id: "org-1", name: "Northstar", slug: "northstar", role: "owner", created_at: "2026-10-01T09:00:00Z" },
    user: { id: "user-1", email: "owner@example.test", display_name: "Owner" }, activeRole: "owner",
    canManageTeam: true, canUpload: true, isDemo: false });
});

function mount(section: SettingsSectionId = "developers") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = (selected: SettingsSectionId) => <QueryClientProvider client={client}><WorkspaceGate>
    <SettingsWorkspace><SettingsSection section={selected} /></SettingsWorkspace>
  </WorkspaceGate></QueryClientProvider>;
  const view = render(tree(section));
  return { ...view, navigate: (path: string, selected: SettingsSectionId) => {
    state.pathname = path; view.rerender(tree(selected));
  } };
}

function noSettingsRequestsOrWrites() {
  for (const request of Object.values(api)) expect(request).not.toHaveBeenCalled();
  expect(createWorkspace.mutateAsync).not.toHaveBeenCalled();
}

describe("actual workspace gate with actual Settings shell and embedded static guide", () => {
  it.each(["workspace-loading", "session-loading", "workspace-error", "no-organization",
    "signed-out-private-mode", "expired-session", "unauthorized-workspace"] as const)("keeps the guide visible for %s without a redirect or admin requests", (scenario) => {
    if (scenario === "workspace-loading") state.isLoading = true;
    if (scenario === "session-loading") state.sessionStatus = "loading";
    if (scenario === "workspace-error") state.error = new Error("Synthetic unavailable workspace");
    if (scenario === "no-organization" || scenario === "signed-out-private-mode") {
      state.organizations = []; state.activeOrganization = null; state.activeRole = null;
      state.canManageTeam = false; state.canUpload = false;
    }
    if (scenario === "signed-out-private-mode") { state.sessionStatus = "unauthenticated"; state.user = null; }
    if (scenario === "expired-session") state.sessionError = "RefreshAccessTokenError";
    if (scenario === "unauthorized-workspace") state.error = new ApiError("Synthetic expired access", 401);
    const { container } = mount();
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Recover without guessing" })).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getByRole("link", { name: "Developer guide" })).toHaveAttribute("aria-current", "page");
    expect(container.querySelector(".developer-guide-embedded")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Create a workspace" })).not.toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
    noSettingsRequestsOrWrites();
  });

  it("does not broaden the exception to another Settings route or a prefix/lookalike", () => {
    state.sessionStatus = "unauthenticated";
    const view = mount();
    expect(screen.getByRole("heading", { name: "Recover without guessing" })).toBeInTheDocument();
    for (const path of ["/settings/general", "/settings/security", "/settings/integrations", "/agents",
      "/contracts/private", "/settings/developers/extra", "/settings/developers-other", "/settings/developers/"]) {
      navigation.replace.mockClear();
      view.navigate(path, "security");
      expect(screen.queryByRole("heading", { name: "Recover without guessing" })).not.toBeInTheDocument();
      expect(screen.getByText("Opening your workspace…")).toBeInTheDocument();
      expect(navigation.replace).toHaveBeenCalledWith(`/signin?callbackUrl=${encodeURIComponent(path)}`);
      noSettingsRequestsOrWrites();
    }
  });

  it("re-applies the ordinary gate when navigating from the readable guide to General", () => {
    state.error = new Error("Synthetic workspace failure");
    const view = mount();
    expect(screen.getByRole("heading", { name: "Recover without guessing" })).toBeVisible();
    view.navigate("/settings/general", "general");
    expect(screen.getByRole("heading", { name: "The workspace could not open." })).toBeVisible();
    expect(screen.queryByLabelText("Workspace name")).not.toBeInTheDocument();
    noSettingsRequestsOrWrites();
  });
});

describe("non-guide workspace gates are unchanged", () => {
  it("still replaces private content with its loading state", () => {
    state.pathname = "/settings/general"; state.isLoading = true;
    mount("general");
    expect(screen.getByLabelText("Loading workspace")).toBeInTheDocument();
    expect(screen.queryByLabelText("Workspace name")).not.toBeInTheDocument();
    noSettingsRequestsOrWrites();
  });
  it("still requires workspace creation without an organization", () => {
    state.pathname = "/settings/general"; state.organizations = []; state.activeOrganization = null;
    mount("general");
    expect(screen.getByRole("heading", { name: "Create a workspace" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save general settings" })).not.toBeInTheDocument();
    noSettingsRequestsOrWrites();
  });
  it("still redirects expired private sessions away from data routes", () => {
    state.pathname = "/settings/security"; state.sessionError = "RefreshAccessTokenError";
    mount("security");
    expect(navigation.replace).toHaveBeenCalledWith("/auth/session-expired?callbackUrl=%2Fsettings%2Fsecurity");
    expect(screen.queryByLabelText("API key label")).not.toBeInTheDocument();
    noSettingsRequestsOrWrites();
  });
});
