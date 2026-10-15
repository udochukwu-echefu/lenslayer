import type { IntegrationConnection } from "../types";
import { isDemoWorkspace } from "../workspace-mode";
import { ApiError } from "./client";

function writable(organizationId: string) {
  if (isDemoWorkspace(organizationId)) throw new ApiError("Calendar consent is unavailable in the synthetic demo.", 403);
  return `/api/calendar/${encodeURIComponent(organizationId)}`;
}

async function calendarRequest<T>(path: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: "POST", credentials: "same-origin", cache: "no-store", signal,
    headers: { "Content-Type": "application/json", "X-LensLayer-Calendar-CSRF": "1" }, body: JSON.stringify(payload ?? {}) });
  if (!response.ok) throw new ApiError("Calendar operation could not be confirmed. Inspect connections before restarting consent.", response.status);
  return response.json() as Promise<T>;
}

export const calendarApi = {
  startCalendarConsent: (org: string, input: { display_name: string; calendar_id: string }, signal?: AbortSignal) =>
    calendarRequest<{ authorization_url: string; expires_at: string }>(`${writable(org)}/oauth/start`, input, signal),
  completeCalendarConsent: (org: string, input: { code: string; state: string }, signal?: AbortSignal) =>
    calendarRequest<IntegrationConnection>(`${writable(org)}/oauth/callback`, input, signal),
  disconnectCalendar: (org: string, connectionId: string, signal?: AbortSignal) =>
    calendarRequest<{ connection_id: string; status: "revoked"; provider_revocation_pending: boolean }>(`${writable(org)}/connections/${encodeURIComponent(connectionId)}/disconnect`, {}, signal),
};
