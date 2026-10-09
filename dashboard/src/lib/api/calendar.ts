import type { IntegrationConnection } from "../types";
import { isDemoWorkspace } from "../workspace-mode";
import { ApiError, jsonRequest } from "./client";

function writable(organizationId: string) {
  if (isDemoWorkspace(organizationId)) throw new ApiError("Calendar consent is unavailable in the synthetic demo.", 403);
  return `/organizations/${encodeURIComponent(organizationId)}/calendar`;
}

export const calendarApi = {
  startCalendarConsent: (org: string, input: { display_name: string; calendar_id: string }, signal?: AbortSignal) =>
    jsonRequest<{ authorization_url: string; expires_at: string }>(`${writable(org)}/oauth/start`, "POST", input, false, signal),
  completeCalendarConsent: (org: string, input: { code: string; state: string }, signal?: AbortSignal) =>
    jsonRequest<IntegrationConnection>(`${writable(org)}/oauth/callback`, "POST", input, false, signal),
  disconnectCalendar: (org: string, connectionId: string, signal?: AbortSignal) =>
    jsonRequest<{ connection_id: string; status: "revoked"; provider_revocation_pending: boolean }>(`${writable(org)}/connections/${encodeURIComponent(connectionId)}/disconnect`, "POST", undefined, false, signal),
};
