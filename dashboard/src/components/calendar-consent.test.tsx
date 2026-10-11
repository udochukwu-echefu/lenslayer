import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { CALENDAR_CONSENT_KEY, calendarAuthorizationUrl, takeCalendarCallback } from "@/lib/calendar-consent";
import type { IntegrationConnection } from "@/lib/types";
import { agentQueryWrapper } from "@/test/agent-query-wrapper";
import { CalendarConnection } from "./calendar-connection";
import { CalendarConsentReturn } from "./calendar-consent-return";

const workspace = vi.hoisted(() => ({ activeRole: "owner", user: { id: "human-1" }, isDemo: false, isLoading: false, organizations: [{ id: "org-1", name: "Private fixture", role: "owner" }], selectOrganization: vi.fn() }));
vi.mock("./workspace-provider", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", () => ({ api: { integrations: vi.fn(), startCalendarConsent: vi.fn(), completeCalendarConsent: vi.fn(), disconnectCalendar: vi.fn() } }));
const connection: IntegrationConnection = { id: "connection-1", organization_id: "org-1", provider: "google_calendar", display_name: "Owned fixture", external_account_id: "oauth-grant:connection-1", status: "active", capabilities: ["events.create", "events.get"], settings: { calendar_ids: ["owned@example.test"] }, last_sync_at: null, error_message: "", created_by_user_id: "human-1", created_by_name: "Human", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
const pending = { organizationId: "org-1", userId: "human-1", expiresAt: "2099-01-01T00:00:00Z" };
function seedCallback(query = "code=synthetic-code&state=synthetic-state") {
  window.history.replaceState(null, "", `/calendar/oauth-return?${query}`);
  window.sessionStorage.setItem(CALENDAR_CONSENT_KEY, JSON.stringify(pending));
}
function showReturn(strict = false) { const { client, Wrapper } = agentQueryWrapper(); const content = <CalendarConsentReturn />; render(strict ? <StrictMode>{content}</StrictMode> : content, { wrapper: Wrapper }); return client; }
beforeEach(() => {
  workspace.activeRole = "owner"; workspace.user = { id: "human-1" }; workspace.isDemo = false; workspace.isLoading = false; workspace.organizations = [{ id: "org-1", name: "Private fixture", role: "owner" }];
  workspace.selectOrganization.mockClear(); window.sessionStorage.clear(); window.history.replaceState(null, "", "/settings");
  vi.mocked(api.integrations).mockReset().mockResolvedValue([]);
  vi.mocked(api.startCalendarConsent).mockReset(); vi.mocked(api.completeCalendarConsent).mockReset().mockResolvedValue(connection);
  vi.mocked(api.disconnectCalendar).mockReset().mockResolvedValue({ connection_id: connection.id, status: "revoked", provider_revocation_pending: true });
});

it("scrubs the callback before auth resolves, keeps credentials out of storage/DOM/cache and exchanges once under StrictMode", async () => {
  seedCallback(); workspace.isLoading = true; const client = showReturn(true);
  await waitFor(() => expect(window.location.search).toBe(""));
  expect(window.sessionStorage.getItem(CALENDAR_CONSENT_KEY)).toBeNull();
  expect(api.completeCalendarConsent).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain("synthetic-code");
  expect(JSON.stringify(client.getQueryCache().getAll())).not.toContain("synthetic-code");
});

it("completes only on an explicit same-human click and never caches code/state", async () => {
  seedCallback(); const client = showReturn(true);
  const button = await screen.findByRole("button", { name: "Complete connection" });
  expect(window.location.search).toBe(""); expect(api.completeCalendarConsent).not.toHaveBeenCalled();
  fireEvent.click(button); fireEvent.click(button);
  expect(await screen.findByText(/Calendar consent is stored/)).toBeInTheDocument();
  expect(api.completeCalendarConsent).toHaveBeenCalledTimes(1);
  expect(api.completeCalendarConsent).toHaveBeenCalledWith("org-1", { code: "synthetic-code", state: "synthetic-state" }, expect.any(AbortSignal));
  expect(JSON.stringify(client.getQueryCache().getAll())).not.toContain("synthetic-code");
  expect(client.getMutationCache().getAll()).toHaveLength(0);
  expect(workspace.selectOrganization).toHaveBeenCalledWith("org-1");
});

it.each([["another person", "human-2", "owner"], ["viewer", "human-1", "viewer"], ["reviewer", "human-1", "reviewer"]])("%s cannot exchange the code", async (_label, userId, role) => {
  seedCallback(); workspace.user = { id: userId }; workspace.organizations[0].role = role; showReturn();
  expect(await screen.findByRole("alert")).toHaveTextContent(/initiating workspace/);
  expect(screen.queryByRole("button", { name: "Complete connection" })).toBeNull();
  expect(api.completeCalendarConsent).not.toHaveBeenCalled();
});

it("failed exchanges require fresh consent and do not echo or replay secret-bearing errors", async () => {
  seedCallback(); vi.mocked(api.completeCalendarConsent).mockRejectedValue(new Error("synthetic-code private provider detail")); showReturn();
  fireEvent.click(await screen.findByRole("button", { name: "Complete connection" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/restart consent/i);
  expect(document.body.textContent).not.toContain("synthetic-code"); expect(api.completeCalendarConsent).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Complete connection" })).toBeNull();
});

it("malformed, denied and expired callbacks clear the entire query without an exchange", () => {
  for (const query of ["code=a&code=b&state=s", "code=a&state=s&error=access_denied", "state=s", "code=a&state=s"]) {
    const url = new URL(`/calendar/oauth-return?${query}#private`, window.location.origin);
    const history = { replaceState: vi.fn() }, storage = { getItem: () => JSON.stringify({ ...pending, expiresAt: "2000-01-01T00:00:00Z" }), removeItem: vi.fn() };
    expect(takeCalendarCallback(url, history, storage)).toBeNull();
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/calendar/oauth-return");
    expect(storage.removeItem).toHaveBeenCalledWith(CALENDAR_CONSENT_KEY);
  }
});

it("consent navigation requires the fixed Google endpoint, exact local callback and narrow scope", () => {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ redirect_uri: `${window.location.origin}/calendar/oauth-return`, scope: "https://www.googleapis.com/auth/calendar.events.owned", state: "synthetic-state" }).toString();
  expect(calendarAuthorizationUrl(url.toString(), window.location.origin)).toBe(url.toString());
  for (const invalid of [url.toString().replace("accounts.google.com", "attacker.example.test"), url.toString().replace("events.owned", "events"), url.toString().replace("oauth-return", "other-callback")]) expect(() => calendarAuthorizationUrl(invalid, window.location.origin)).toThrow();
});

it("stores only actor/workspace/expiry metadata before redirect, and denies synthetic/read-only provisioning", async () => {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ redirect_uri: `${window.location.origin}/calendar/oauth-return`, scope: "https://www.googleapis.com/auth/calendar.events.owned", state: "synthetic-state" }).toString();
  vi.mocked(api.startCalendarConsent).mockResolvedValue({ authorization_url: url.toString(), expires_at: pending.expiresAt });
  const authorize = vi.fn(), { Wrapper } = agentQueryWrapper();
  const view = render(<CalendarConnection organizationId="org-1" authorize={authorize} />, { wrapper: Wrapper });
  fireEvent.change(screen.getByLabelText("Connection label"), { target: { value: "Owned fixture" } });
  fireEvent.change(screen.getByLabelText("Owned calendar ID"), { target: { value: "owned@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue to Google consent" }));
  await waitFor(() => expect(authorize).toHaveBeenCalledWith(url.toString()));
  expect(JSON.parse(window.sessionStorage.getItem(CALENDAR_CONSENT_KEY)!)).toEqual(pending);
  expect(window.sessionStorage.getItem(CALENDAR_CONSENT_KEY)).not.toContain("synthetic-state");
  view.unmount(); workspace.isDemo = true;
  render(<CalendarConnection organizationId="public-workspace" />, { wrapper: Wrapper });
  expect(screen.queryByLabelText("Owned calendar ID")).toBeNull();
});

it("shows pending provider revocation separately from immediate local disconnect", async () => {
  vi.mocked(api.integrations).mockResolvedValue([connection]); const { Wrapper } = agentQueryWrapper();
  render(<CalendarConnection organizationId="org-1" />, { wrapper: Wrapper });
  fireEvent.click(await screen.findByRole("button", { name: "Disconnect calendar" }));
  expect(await screen.findByText(/Provider revocation is pending/)).toBeInTheDocument();
  expect(api.disconnectCalendar).toHaveBeenCalledWith("org-1", connection.id, expect.any(AbortSignal));
});

it("changing workspace aborts a pending start and cannot redirect or save stale consent", async () => {
  let resolve!: (value: { authorization_url: string; expires_at: string }) => void;
  vi.mocked(api.startCalendarConsent).mockReturnValue(new Promise((done) => { resolve = done; }));
  const authorize = vi.fn(), { Wrapper } = agentQueryWrapper();
  const view = render(<CalendarConnection organizationId="org-1" authorize={authorize} />, { wrapper: Wrapper });
  fireEvent.change(screen.getByLabelText("Connection label"), { target: { value: "Owned fixture" } });
  fireEvent.change(screen.getByLabelText("Owned calendar ID"), { target: { value: "owned@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue to Google consent" }));
  const signal = vi.mocked(api.startCalendarConsent).mock.calls[0][2]!;
  view.rerender(<CalendarConnection organizationId="org-2" authorize={authorize} />);
  expect(signal.aborted).toBe(true);
  await act(async () => { resolve({ authorization_url: "https://accounts.google.com/o/oauth2/v2/auth", expires_at: pending.expiresAt }); });
  await waitFor(() => expect(screen.getByRole("button", { name: "Continue to Google consent" })).toBeEnabled());
  expect(authorize).not.toHaveBeenCalled();
  expect(window.sessionStorage.getItem(CALENDAR_CONSENT_KEY)).toBeNull();
});

it("loss of callback ownership aborts the exchange and never reports a late connection", async () => {
  let resolve!: (value: IntegrationConnection) => void;
  vi.mocked(api.completeCalendarConsent).mockReturnValue(new Promise((done) => { resolve = done; }));
  seedCallback(); const { Wrapper } = agentQueryWrapper();
  const view = render(<CalendarConsentReturn />, { wrapper: Wrapper });
  fireEvent.click(await screen.findByRole("button", { name: "Complete connection" }));
  const signal = vi.mocked(api.completeCalendarConsent).mock.calls[0][2]!;
  workspace.user = { id: "human-2" }; view.rerender(<CalendarConsentReturn />);
  expect(await screen.findByRole("alert")).toHaveTextContent(/restart consent/i);
  expect(signal.aborted).toBe(true);
  await act(async () => { resolve(connection); });
  await waitFor(() => expect(workspace.selectOrganization).not.toHaveBeenCalled());
  expect(screen.queryByText(/Calendar consent is stored/)).toBeNull();
});
