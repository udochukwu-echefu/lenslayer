import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { OrganizationSettings, Role } from "@/lib/types";
import { SettingsSection } from "./settings-section";
import { SettingsWorkspace } from "./settings-workspace";
import type { SettingsSectionId } from "./sections";

const state = vi.hoisted(() => ({
  pathname: "/settings/general",
  activeOrganization: { id: "org-1", name: "Northstar", slug: "northstar", role: "owner" as Role | null, created_at: "2026-10-01T09:00:00Z" },
  user: { id: "user-1", email: "owner@example.test", display_name: "Workspace owner" },
  activeRole: "owner" as Role | null, canManageTeam: true, canUpload: true, isDemo: false, isLoading: false, error: null as Error | null,
}));
vi.mock("@/components/workspace-provider", () => ({ useWorkspace: () => state }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/components/calendar-connection", () => ({ CalendarConnection: ({ organizationId }: { organizationId: string }) => <section aria-label="Calendar consent"><h3>Google Calendar for agent actions</h3><span>{organizationId}</span></section> }));
vi.mock("@/lib/api", () => ({ api: {
  organizationSettings: vi.fn(), updateOrganizationSettings: vi.fn(), apiKeys: vi.fn(), createApiKey: vi.fn(), revokeApiKey: vi.fn(),
  integrations: vi.fn(), integrationProviders: vi.fn(), intakeEmailAddress: vi.fn(), integrationImports: vi.fn(),
  webhooks: vi.fn(), webhookDeliveries: vi.fn(), createIntegration: vi.fn(), revokeIntegration: vi.fn(), createWebhook: vi.fn(), revokeWebhook: vi.fn(),
} }));

const settings: OrganizationSettings = { organization_id: "org-1", name: "Northstar", slug: "northstar", default_retention_days: 30,
  default_retain_document: false, default_retain_source_text: false, notification_review_ready: true, notification_review_failed: true, updated_at: "2026-10-15T09:00:00Z" };

beforeEach(() => {
  Object.assign(state, { pathname: "/settings/general", activeOrganization: { id: "org-1", name: "Northstar", slug: "northstar", role: "owner", created_at: "2026-10-01T09:00:00Z" },
    user: { id: "user-1", email: "owner@example.test", display_name: "Workspace owner" }, activeRole: "owner", canManageTeam: true, canUpload: true, isDemo: false, isLoading: false, error: null });
  vi.clearAllMocks();
  vi.mocked(api.organizationSettings).mockResolvedValue({ ...settings });
  vi.mocked(api.updateOrganizationSettings).mockImplementation(async (_id, patch) => ({ ...settings, ...patch }));
  for (const name of ["apiKeys", "integrations", "integrationProviders", "integrationImports", "webhooks", "webhookDeliveries"] as const) vi.mocked(api[name]).mockResolvedValue([]);
  vi.mocked(api.intakeEmailAddress).mockResolvedValue({ address: "", enabled: false, instructions: "Ask your operator to configure forwarding." });
  vi.mocked(api.revokeApiKey).mockResolvedValue(undefined);
  vi.mocked(api.revokeIntegration).mockResolvedValue(undefined);
  vi.mocked(api.revokeWebhook).mockResolvedValue(undefined);
});

function mount(section: SettingsSectionId) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  function View({ selected }: { selected: SettingsSectionId }) {
    return <QueryClientProvider client={client}><SettingsWorkspace><SettingsSection section={selected} /></SettingsWorkspace></QueryClientProvider>;
  }
  state.pathname = `/settings/${section}`;
  const view = render(<View selected={section} />);
  return { client, ...view, navigate: (next: SettingsSectionId) => { state.pathname = `/settings/${next}`; view.rerender(<View selected={next} />); } };
}

function managementNotRequested() {
  for (const name of ["apiKeys", "integrations", "integrationProviders", "integrationImports", "intakeEmailAddress", "webhooks", "webhookDeliveries"] as const) expect(api[name]).not.toHaveBeenCalled();
}

describe("focused Settings navigation and access", () => {
  it("renders the persistent route rail and only General's form", async () => {
    mount("general");
    expect(await screen.findByLabelText("Workspace name")).toHaveValue("Northstar");
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getAllByRole("link")).toHaveLength(7);
    expect(within(nav).getByRole("link", { name: "General" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Developer guide" })).toHaveAttribute("href", "/settings/developers");
    expect(screen.queryByLabelText("Default retention")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Public API keys" })).toBeNull();
    managementNotRequested();
  });

  it("Identity reads actual user/workspace metadata without any settings or admin request", () => {
    mount("identity");
    expect(screen.getByText("owner@example.test")).toBeInTheDocument();
    expect(screen.getByText("Workspace owner")).toBeInTheDocument();
    expect(screen.getByText("org-1")).toBeInTheDocument();
    expect(screen.queryByLabelText("Workspace name")).toBeNull();
    expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
    expect(api.organizationSettings).not.toHaveBeenCalled();
    managementNotRequested();
  });

  it("Security contains access and API keys, not intake, Calendar or policy forms", async () => {
    mount("security");
    expect(screen.getByRole("heading", { name: "Role and access" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage team access" })).toHaveAttribute("href", "/team");
    expect(await screen.findByText("No public API keys in this workspace.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Calendar consent" })).toBeNull();
    expect(screen.queryByLabelText("Webhook endpoint")).toBeNull();
    expect(api.organizationSettings).not.toHaveBeenCalled();
    expect(api.integrations).not.toHaveBeenCalled();
    expect(api.apiKeys).toHaveBeenCalledWith("org-1");
  });

  it("Integrations contains Calendar/connectors/intake/webhooks/logs but never API keys", async () => {
    mount("integrations");
    expect(screen.getByRole("region", { name: "Calendar consent" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connections" })).toBeInTheDocument();
    expect(await screen.findByText(/Forwarding is not configured/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy address" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Recent intake" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Delivery log" })).toBeInTheDocument();
    expect(screen.queryByLabelText("API key label")).toBeNull();
    expect(api.apiKeys).not.toHaveBeenCalled();
    expect(api.organizationSettings).not.toHaveBeenCalled();
  });

  it.each(["viewer", "reviewer"] as const)("%s can read Identity and the guide but never mounts management", (role) => {
    state.activeRole = role; state.activeOrganization.role = role; state.canManageTeam = false;
    const view = mount("identity");
    expect(screen.getByText("owner@example.test")).toBeInTheDocument();
    view.navigate("security");
    expect(screen.queryByLabelText("API key label")).toBeNull();
    view.navigate("integrations");
    expect(screen.queryByRole("region", { name: "Calendar consent" })).toBeNull();
    view.navigate("developers");
    expect(screen.getByRole("heading", { name: "5. Check the verified receipt" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inspect runs" })).toHaveAttribute("href", "/agents/runs");
    expect(api.organizationSettings).not.toHaveBeenCalled();
    managementNotRequested();
  });

  it("guide stays readable with workspace load/access errors and no admin settings dependency", () => {
    state.isLoading = true; state.error = new Error("Workspace unavailable");
    const { container, navigate } = mount("developers");
    expect(screen.getByText(/guide is available while access loads/)).toBeInTheDocument();
    expect(container.querySelector(".developer-nav")).toBeNull();
    expect(container.querySelector("main")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(api.organizationSettings).not.toHaveBeenCalled();
    state.isLoading = false;
    navigate("developers");
    expect(screen.getByRole("alert")).toHaveTextContent("You can still read this guide");
    managementNotRequested();
  });

  it("demo remains read-only even with accidentally optimistic role flags", async () => {
    state.isDemo = true;
    const view = mount("general");
    expect(await screen.findByLabelText("Workspace name")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
    view.navigate("security");
    view.navigate("integrations");
    expect(screen.getByText(/Read-only demo/)).toBeInTheDocument();
    managementNotRequested();
    expect(api.updateOrganizationSettings).not.toHaveBeenCalled();
  });

  it("a nonadmin role cannot mount key management even if an optimistic capability flag is true", () => {
    state.activeRole = "viewer";
    state.canManageTeam = true;
    mount("security");
    expect(screen.queryByLabelText("API key label")).toBeNull();
    managementNotRequested();
  });

  it("scope-specific API failure leaves navigation, Identity and guide usable", async () => {
    vi.mocked(api.organizationSettings).mockRejectedValue(new Error("Policy access denied"));
    const view = mount("general");
    expect(await screen.findByText("Policy access denied")).toBeInTheDocument();
    view.navigate("identity");
    expect(screen.getByText("owner@example.test")).toBeInTheDocument();
    view.navigate("developers");
    expect(screen.getByRole("heading", { name: "Recover without guessing" })).toBeInTheDocument();
  });
});

describe("section-scoped drafts and writes", () => {
  it("a delayed General response cannot revert a newer saved Notifications field", async () => {
    let completeGeneral!: (value: OrganizationSettings) => void;
    let completeNotifications!: (value: OrganizationSettings) => void;
    vi.mocked(api.updateOrganizationSettings).mockImplementation((_id, patch) => new Promise((resolve) => {
      if ("name" in patch) completeGeneral = resolve;
      else completeNotifications = resolve;
    }));
    const view = mount("general");
    fireEvent.change(await screen.findByLabelText("Workspace name"), { target: { value: "  Saved new name  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save general settings" }));
    await waitFor(() => expect(api.updateOrganizationSettings).toHaveBeenCalledWith("org-1", { name: "  Saved new name  " }));

    view.navigate("notifications");
    fireEvent.click(await screen.findByRole("checkbox", { name: /Review failed/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save notifications" }));
    await waitFor(() => expect(api.updateOrganizationSettings).toHaveBeenLastCalledWith("org-1", { notification_review_failed: false }));
    const notificationResult = { ...settings, name: "Saved new name", notification_review_failed: false, updated_at: "2026-10-16T10:01:00Z" };
    await act(async () => completeNotifications(notificationResult));
    await screen.findByText("This section’s settings were saved.");
    expect(screen.getByRole("checkbox", { name: /Review failed/ })).not.toBeChecked();

    // General committed first, but its older full snapshot arrives last.
    await act(async () => completeGeneral({ ...settings, name: "Saved new name" }));
    view.navigate("general");
    // Server-normalized name and a cleared matching draft prove completion.
    await waitFor(() => expect(screen.getByLabelText("Workspace name")).toHaveValue("Saved new name"));
    expect(screen.getByRole("button", { name: "Save general settings" })).toBeDisabled();
    view.navigate("notifications");
    expect(screen.getByRole("checkbox", { name: /Review failed/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save notifications" })).toBeDisabled();
    expect(view.client.getQueryData<OrganizationSettings>(["organization-settings", "org-1"])).toEqual({
      ...settings, name: "Saved new name", notification_review_failed: false,
    });
    expect(api.updateOrganizationSettings).toHaveBeenCalledTimes(2);
  });

  it("preserves a General draft across navigation and saves only notification fields", async () => {
    const view = mount("general");
    fireEvent.change(await screen.findByLabelText("Workspace name"), { target: { value: "Unsaved workspace draft" } });
    view.navigate("notifications");
    fireEvent.click(await screen.findByRole("checkbox", { name: /Review failed/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save notifications" }));
    await waitFor(() => expect(api.updateOrganizationSettings).toHaveBeenCalledWith("org-1", { notification_review_failed: false }));
    await screen.findByText("This section’s settings were saved.");
    view.navigate("general");
    expect(screen.getByLabelText("Workspace name")).toHaveValue("Unsaved workspace draft");
    fireEvent.click(screen.getByRole("button", { name: "Save general settings" }));
    await waitFor(() => expect(api.updateOrganizationSettings).toHaveBeenLastCalledWith("org-1", { name: "Unsaved workspace draft" }));
  });

  it("Data save does not submit a hidden invalid General name or reset that draft", async () => {
    const view = mount("general");
    fireEvent.change(await screen.findByLabelText("Workspace name"), { target: { value: "x" } });
    expect(screen.getByRole("button", { name: "Save general settings" })).toBeDisabled();
    view.navigate("data");
    fireEvent.click(await screen.findByRole("checkbox", { name: /Retain extracted text/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save retention defaults" }));
    await waitFor(() => expect(api.updateOrganizationSettings).toHaveBeenCalledWith("org-1", { default_retain_source_text: true }));
    await screen.findByText("This section’s settings were saved.");
    view.navigate("general");
    expect(screen.getByLabelText("Workspace name")).toHaveValue("x");
  });

  it("a save response cannot discard a newer edit made while it was pending", async () => {
    let complete!: (value: OrganizationSettings) => void;
    vi.mocked(api.updateOrganizationSettings).mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    mount("general");
    fireEvent.change(await screen.findByLabelText("Workspace name"), { target: { value: "Submitted" } });
    fireEvent.click(screen.getByRole("button", { name: "Save general settings" }));
    await waitFor(() => expect(api.updateOrganizationSettings).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "Newer unsaved edit" } });
    await act(async () => complete({ ...settings, name: "Submitted" }));
    expect(screen.getByLabelText("Workspace name")).toHaveValue("Newer unsaved edit");
    expect(screen.getByRole("button", { name: "Save general settings" })).toBeEnabled();
  });

  it("workspace switching never sends another workspace's draft", async () => {
    const view = mount("general");
    fireEvent.change(await screen.findByLabelText("Workspace name"), { target: { value: "Private org-1 draft" } });
    state.activeOrganization = { ...state.activeOrganization, id: "org-2", name: "Second", slug: "second" };
    vi.mocked(api.organizationSettings).mockResolvedValue({ ...settings, organization_id: "org-2", name: "Second" });
    view.navigate("general");
    expect(await screen.findByDisplayValue("Second")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save general settings" })).toBeDisabled();
    expect(api.updateOrganizationSettings).not.toHaveBeenCalled();
  });

  it("failed saves retain the draft through navigation instead of resetting settings", async () => {
    vi.mocked(api.updateOrganizationSettings).mockRejectedValue(new Error("Save was not confirmed"));
    const view = mount("general");
    fireEvent.change(await screen.findByLabelText("Workspace name"), { target: { value: "Keep my draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save general settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Save was not confirmed");
    view.navigate("identity");
    view.navigate("general");
    expect(screen.getByLabelText("Workspace name")).toHaveValue("Keep my draft");
    expect(screen.getByRole("button", { name: "Save general settings" })).toBeEnabled();
  });
});

describe("security one-time tokens", () => {
  it("keeps a token out of query/mutation caches and clears it on navigation", async () => {
    vi.mocked(api.createApiKey).mockResolvedValue({ token: "synthetic-settings-token", api_key: { id: "key-1", organization_id: "org-1", name: "Server", key_prefix: "test", scopes: ["contracts:read"], last_used_at: null, revoked_at: null, created_by_user_id: "user-1", created_by_name: "Owner", created_at: "2026-10-15T09:00:00Z" } });
    const view = mount("security");
    fireEvent.change(await screen.findByLabelText("API key label"), { target: { value: "Server" } });
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    expect(await screen.findByLabelText("Copy this public API token now")).toHaveValue("synthetic-settings-token");
    expect(JSON.stringify(view.client.getMutationCache().getAll().map((m) => m.state.data))).not.toContain("synthetic-settings-token");
    expect(JSON.stringify(view.client.getQueryCache().getAll().map((q) => q.state.data))).not.toContain("synthetic-settings-token");
    view.navigate("identity");
    view.navigate("security");
    expect(screen.queryByDisplayValue("synthetic-settings-token")).toBeNull();
  });

  it("a pending key response cannot repopulate a display after pagehide", async () => {
    let complete!: (value: Awaited<ReturnType<typeof api.createApiKey>>) => void;
    vi.mocked(api.createApiKey).mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const view = mount("security");
    fireEvent.change(await screen.findByLabelText("API key label"), { target: { value: "Pending server" } });
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(api.createApiKey).toHaveBeenCalledTimes(1));
    fireEvent(window, new Event("pagehide"));
    await act(async () => complete({ token: "synthetic-late-token", api_key: { id: "late-key", organization_id: "org-1", name: "Pending server", key_prefix: "test", scopes: ["contracts:read"], last_used_at: null, revoked_at: null, created_by_user_id: "user-1", created_by_name: "Owner", created_at: "2026-10-15T09:00:00Z" } }));
    expect(screen.queryByDisplayValue("synthetic-late-token")).toBeNull();
    expect(screen.getByText(/its one-time display was cleared/)).toBeInTheDocument();
    expect(JSON.stringify(view.client.getMutationCache().getAll().map((m) => m.state.data))).not.toContain("synthetic-late-token");
  });

  it("one-time webhook secret remains local, outside mutation data, and dismisses explicitly", async () => {
    vi.mocked(api.createWebhook).mockResolvedValue({ signing_secret: "synthetic-webhook-secret", subscription: {
      id: "hook-1", organization_id: "org-1", target_url: "https://example.test/hook", description: "", events: ["contract.created"], secret_prefix: "test", status: "active", last_delivery_at: null, created_by_user_id: "user-1", created_by_name: "Owner", created_at: "2026-10-15T09:00:00Z", updated_at: "2026-10-15T09:00:00Z",
    } });
    const view = mount("integrations");
    fireEvent.change(await screen.findByLabelText("Webhook endpoint"), { target: { value: "https://example.test/hook" } });
    fireEvent.click(screen.getByRole("button", { name: "Add webhook" }));
    expect(await screen.findByLabelText("Copy this webhook signing secret now")).toHaveValue("synthetic-webhook-secret");
    expect(JSON.stringify(view.client.getMutationCache().getAll().map((m) => m.state.data))).not.toContain("synthetic-webhook-secret");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss secret" }));
    expect(screen.queryByDisplayValue("synthetic-webhook-secret")).toBeNull();
  });
});
