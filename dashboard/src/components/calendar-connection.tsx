"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { CALENDAR_CONSENT_KEY, calendarAuthorizationUrl } from "@/lib/calendar-consent";
import { canAdministerAgents } from "@/lib/agent-state";
import { useWorkspace } from "./workspace-provider";
import "./calendar-connection.css";

const navigate = (url: string) => window.location.assign(url);

export function CalendarConnection({ organizationId, authorize = navigate }: { organizationId: string; authorize?: (url: string) => void }) {
  const { activeRole, user, isDemo } = useWorkspace();
  const canManage = canAdministerAgents(activeRole, isDemo) && Boolean(user?.id);
  return <CalendarConnectionForm key={`${organizationId}:${user?.id}:${activeRole}:${isDemo}`} organizationId={organizationId} authorize={authorize} userId={user?.id ?? ""} canManage={canManage} />;
}

function CalendarConnectionForm({ organizationId, authorize, userId, canManage }: { organizationId: string; authorize: (url: string) => void; userId: string; canManage: boolean }) {
  const client = useQueryClient();
  const pending = useRef<AbortController | null>(null);
  const connections = useQuery({ queryKey: ["integrations", organizationId], queryFn: () => api.integrations(organizationId), enabled: canManage });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revocation, setRevocation] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const abort = () => pending.current?.abort();
    const leave = () => { abort(); pending.current = null; setBusy(false); setError("Consent was interrupted. Inspect existing connections before starting again."); };
    window.addEventListener("pagehide", leave);
    return () => { abort(); window.removeEventListener("pagehide", leave); };
  }, []);
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canManage || busy || pending.current) return;
    const form = new FormData(event.currentTarget);
    const calendarId = String(form.get("calendar_id") ?? "").trim();
    if (!calendarId || /[\s*]/.test(calendarId)) { setError("Supply one exact calendar ID without whitespace or wildcards."); return; }
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError("");
    try {
      const consent = await api.startCalendarConsent(organizationId, { display_name: String(form.get("display_name") ?? "").trim(), calendar_id: calendarId }, controller.signal);
      if (controller.signal.aborted) return;
      const url = calendarAuthorizationUrl(consent.authorization_url, window.location.origin);
      if (!Number.isFinite(Date.parse(consent.expires_at)) || Date.parse(consent.expires_at) <= Date.now()) throw new Error("expired");
      window.sessionStorage.setItem(CALENDAR_CONSENT_KEY, JSON.stringify({ organizationId, userId, expiresAt: consent.expires_at }));
      authorize(url); // Only these non-secret IDs/expiry survive the redirect.
    } catch {
      if (controller.signal.aborted) return;
      try { window.sessionStorage.removeItem(CALENDAR_CONSENT_KEY); } catch { /* Storage may be unavailable. */ }
      setError("Calendar consent could not start. Check the server OAuth configuration and exact dashboard callback URL, then try again.");
    } finally { if (pending.current === controller) pending.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  async function disconnect(id: string) {
    if (!canManage || busy || pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError("");
    try {
      const result = await api.disconnectCalendar(organizationId, id, controller.signal);
      if (controller.signal.aborted) return;
      setRevocation((current) => ({ ...current, [id]: result.provider_revocation_pending }));
      await client.invalidateQueries({ queryKey: ["integrations", organizationId] });
      await client.invalidateQueries({ queryKey: ["integration-providers", organizationId] });
    } catch { if (!controller.signal.aborted) setError("Disconnect could not be confirmed. Inspect the connection before retrying."); }
    finally { if (pending.current === controller) pending.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <section id="calendar-connection" className="integration-panel wide calendar-connection" aria-labelledby="calendar-connection-heading">
    <h3 id="calendar-connection-heading">Google Calendar for agent actions</h3>
    <p>Connect a calendar you own. Agents receive an exact connection/calendar pair and can propose one private timed event. Stored consent is checked again when an action dispatches.</p>
    {canManage ? <form onSubmit={start} className="calendar-connect-form"><fieldset disabled={busy}>
      <div className="field"><label htmlFor="calendar-label">Connection label</label><input className="input" id="calendar-label" name="display_name" required maxLength={255} /></div>
      <div className="field"><label htmlFor="owned-calendar-id">Owned calendar ID</label><input className="input" id="owned-calendar-id" name="calendar_id" required maxLength={1024} aria-describedby="calendar-id-help" /><p id="calendar-id-help">Find it in Google Calendar settings under Integrate calendar. Use a disposable calendar for initial verification.</p></div>
      <button className="button secondary" type="submit">{busy ? "Working…" : "Continue to Google consent"}</button>
    </fieldset></form> : <p>Only an owner or administrator in a signed-in private workspace can connect a calendar.</p>}
    <p className="field-help">Disconnect blocks LensLayer writes immediately. Google revocation may also affect grants for the same account and OAuth project. Existing events remain.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {canManage && connections.error && <p role="alert">Calendar connection records could not load.</p>}
    <div className="calendar-connections">{canManage && connections.data?.filter((item) => item.provider === "google_calendar").map((item) => <article key={item.id}>
      <h4>{item.display_name}</h4><p>{item.status === "active" ? "Consent stored; access is verified during dispatch." : "Locally revoked."}</p>
      <dl><div><dt>Connection ID</dt><dd><code>{item.id}</code></dd></div><div><dt>Delegated calendar IDs</dt><dd><code>{Array.isArray(item.settings.calendar_ids) ? item.settings.calendar_ids.join(", ") : "Unavailable"}</code></dd></div></dl>
      {revocation[item.id] === true && <p role="status">Provider revocation is pending. Retry disconnect or revoke the app in the Google account.</p>}
      {canManage && <button className="button secondary" type="button" disabled={busy} onClick={() => void disconnect(item.id)}>{item.status === "active" ? "Disconnect calendar" : "Retry provider revocation"}</button>}
    </article>)}</div>
  </section>;
}
