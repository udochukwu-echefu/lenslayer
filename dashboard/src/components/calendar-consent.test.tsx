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

it("keeps a confirmed connection visible after the original OAuth state expires", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  try {
    vi.setSystemTime(new Date("2026-10-15T09:00:00Z"));
    seedCallback();
    window.sessionStorage.setItem(CALENDAR_CONSENT_KEY, JSON.stringify({ ...pending, expiresAt: "2026-10-15T09:10:00Z" }));
    showReturn(true);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Complete connection" }));
    await act(async () => {});
    expect(screen.getByText(/Calendar consent is stored/)).toBeInTheDocument();
    const signal = vi.mocked(api.completeCalendarConsent).mock.calls[0][2]!;

    await act(async () => { vi.advanceTimersByTime(10 * 60 * 1000 + 1); });

    expect(screen.getByText(/Calendar consent is stored/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(signal.aborted).toBe(false);
    expect(api.completeCalendarConsent).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});

it("still aborts an unconfirmed exchange at state expiry and ignores its late response", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  try {
    vi.setSystemTime(new Date("2026-10-15T09:00:00Z"));
    let resolve!: (value: IntegrationConnection) => void;
    vi.mocked(api.completeCalendarConsent).mockReturnValue(new Promise((done) => { resolve = done; }));
    seedCallback();
    window.sessionStorage.setItem(CALENDAR_CONSENT_KEY, JSON.stringify({ ...pending, expiresAt: "2026-10-15T09:10:00Z" }));
    showReturn(true);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Complete connection" }));
    const signal = vi.mocked(api.completeCalendarConsent).mock.calls[0][2]!;

    await act(async () => { vi.advanceTimersByTime(10 * 60 * 1000 + 1); });
    expect(signal.aborted).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent(/Inspect existing connections/);
    await act(async () => { resolve(connection); });
    expect(screen.queryByText(/Calendar consent is stored/)).toBeNull();
    expect(workspace.selectOrganization).not.toHaveBeenCalled();
    expect(api.completeCalendarConsent).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
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
  expect(screen.getByText("Locally revoked. LensLayer writes are blocked.")).toBeInTheDocument();
  expect(screen.getByText(/Retry disconnect or revoke the app in the Google account/)).toBeInTheDocument();
  expect(screen.getByText(/Google revocation may also affect grants for the same account and OAuth project/)).toBeInTheDocument();
  const retry = await screen.findByRole("button", { name: "Retry provider revocation" });
  await waitFor(() => expect(retry).toBeEnabled());
  expect(api.disconnectCalendar).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Disconnect calendar" })).toBeNull();
  fireEvent.click(retry);
  await waitFor(() => expect(api.disconnectCalendar).toHaveBeenCalledTimes(2));
  expect(api.disconnectCalendar).toHaveBeenCalledWith("org-1", connection.id, expect.any(AbortSignal));
});

it("shows no provider revocation pending only after a false server result and removes unnecessary retry", async () => {
  vi.mocked(api.integrations).mockResolvedValue([connection]);
  vi.mocked(api.disconnectCalendar).mockResolvedValue({ connection_id: connection.id, status: "revoked", provider_revocation_pending: false });
  const { Wrapper } = agentQueryWrapper();
  const view = render(<CalendarConnection organizationId="org-1" />, { wrapper: Wrapper });
  fireEvent.click(await screen.findByRole("button", { name: "Disconnect calendar" }));
  expect(await screen.findByRole("status")).toHaveTextContent("The server reports no provider revocation pending for this connection.");
  expect(screen.getByText("Locally revoked. LensLayer writes are blocked.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry provider revocation" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Disconnect calendar" })).toBeNull();
  expect(screen.queryByText(/Provider revocation is pending/)).toBeNull();
  view.rerender(<CalendarConnection organizationId="org-1" />);
  await act(async () => {});
  expect(api.disconnectCalendar).toHaveBeenCalledTimes(1);
  expect(api.startCalendarConsent).not.toHaveBeenCalled();
  expect(api.completeCalendarConsent).not.toHaveBeenCalled();
});

it("treats revoked connection metadata after reload as unknown, not pending or provider completion", async () => {
  vi.mocked(api.integrations).mockResolvedValue([{ ...connection, status: "revoked" }]);
  const { Wrapper } = agentQueryWrapper();
  render(<StrictMode><CalendarConnection organizationId="org-1" /></StrictMode>, { wrapper: Wrapper });
  expect(await screen.findByRole("status")).toHaveTextContent("Provider revocation status is unknown in this session. Local revocation blocks LensLayer writes; check the app’s access in the Google account before deciding whether further action is needed.");
  expect(screen.getByText("Locally revoked. LensLayer writes are blocked.")).toBeInTheDocument();
  expect(screen.queryByText(/server reports no provider revocation pending/)).toBeNull();
  expect(screen.queryByText(/Provider revocation is pending/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry provider revocation" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Disconnect calendar" })).toBeNull();
  await act(async () => {});
  expect(api.disconnectCalendar).not.toHaveBeenCalled();
});

it("does not persist a no-pending result across remount or infer it from revoked list metadata", async () => {
  vi.mocked(api.integrations).mockResolvedValue([connection]);
  vi.mocked(api.disconnectCalendar).mockResolvedValue({ connection_id: connection.id, status: "revoked", provider_revocation_pending: false });
  const first = agentQueryWrapper();
  const view = render(<CalendarConnection organizationId="org-1" />, { wrapper: first.Wrapper });
  fireEvent.click(await screen.findByRole("button", { name: "Disconnect calendar" }));
  expect(await screen.findByText(/server reports no provider revocation pending/)).toBeInTheDocument();
  view.unmount();
  vi.mocked(api.integrations).mockResolvedValue([{ ...connection, status: "revoked" }]);
  const second = agentQueryWrapper();
  render(<CalendarConnection organizationId="org-1" />, { wrapper: second.Wrapper });
  expect(await screen.findByText(/Provider revocation status is unknown in this session/)).toBeInTheDocument();
  expect(screen.queryByText(/server reports no provider revocation pending/)).toBeNull();
  expect(api.disconnectCalendar).toHaveBeenCalledTimes(1);
});

it("clears the retry prompt when an explicitly requested pending-revocation retry returns false", async () => {
  vi.mocked(api.integrations).mockResolvedValue([{ ...connection, status: "revoked" }]).mockResolvedValueOnce([connection]);
  vi.mocked(api.disconnectCalendar)
    .mockResolvedValueOnce({ connection_id: connection.id, status: "revoked", provider_revocation_pending: true })
    .mockResolvedValueOnce({ connection_id: connection.id, status: "revoked", provider_revocation_pending: false });
  const { Wrapper } = agentQueryWrapper();
  render(<CalendarConnection organizationId="org-1" />, { wrapper: Wrapper });
  fireEvent.click(await screen.findByRole("button", { name: "Disconnect calendar" }));
  const retry = await screen.findByRole("button", { name: "Retry provider revocation" });
  await waitFor(() => expect(retry).toBeEnabled());
  expect(api.disconnectCalendar).toHaveBeenCalledTimes(1);
  fireEvent.click(retry);
  expect(await screen.findByText(/server reports no provider revocation pending/)).toBeInTheDocument();
  expect(screen.queryByText(/Provider revocation is pending/)).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry provider revocation" })).toBeNull();
  await act(async () => {});
  expect(api.disconnectCalendar).toHaveBeenCalledTimes(2);
});

it("does not turn a failed disconnect into success or automatically retry", async () => {
  vi.mocked(api.integrations).mockResolvedValue([{ ...connection, status: "revoked" }]);
  vi.mocked(api.disconnectCalendar).mockResolvedValueOnce({ connection_id: connection.id, status: "revoked", provider_revocation_pending: true }).mockRejectedValueOnce(new Error("unavailable"));
  // Start from active metadata to obtain a genuine same-session pending result.
  vi.mocked(api.integrations).mockResolvedValueOnce([connection]);
  const { Wrapper } = agentQueryWrapper();
  render(<CalendarConnection organizationId="org-1" />, { wrapper: Wrapper });
  fireEvent.click(await screen.findByRole("button", { name: "Disconnect calendar" }));
  const retry = await screen.findByRole("button", { name: "Retry provider revocation" });
  await waitFor(() => expect(retry).toBeEnabled());
  fireEvent.click(retry);
  expect(await screen.findByRole("alert")).toHaveTextContent("Disconnect could not be confirmed. Inspect the connection before retrying.");
  expect(screen.getByText(/Provider revocation is pending/)).toBeInTheDocument();
  expect(screen.queryByText(/server reports no provider revocation pending/)).toBeNull();
  await act(async () => {});
  expect(api.disconnectCalendar).toHaveBeenCalledTimes(2);
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
