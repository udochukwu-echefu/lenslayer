"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { AgentCreate, ToolName } from "@/lib/agent-types";
import { OneTimeCredential } from "./one-time-credential";

export function AgentCreateForm({ organizationId, close }: { organizationId: string; close: () => void }) {
  const client = useQueryClient();
  const [credential, setCredential] = useState<string | null>(null);
  const [validationError, setValidationError] = useState("");
  const alive = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const contracts = useQuery({ queryKey: ["contracts", organizationId], queryFn: () => api.contracts(organizationId) });
  const members = useQuery({ queryKey: ["members", organizationId], queryFn: () => api.members(organizationId) });
  const mutation = useMutation({
    mutationFn: async (input: AgentCreate) => {
      pending.current = new AbortController();
      const created = await api.createAgent(organizationId, input, pending.current.signal);
      if (alive.current && !pending.current.signal.aborted) setCredential(created.token);
      // Only non-secret metadata may enter TanStack's mutation cache.
      return created.agent;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["agents", organizationId] }),
    retry: false,
  });

  useEffect(() => {
    alive.current = true;
    const clear = () => { setCredential(null); pending.current?.abort(); };
    const visibility = () => { if (document.visibilityState === "hidden") clear(); };
    window.addEventListener("pagehide", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      alive.current = false;
      pending.current?.abort();
      window.removeEventListener("pagehide", clear);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const contractIds = form.getAll("contract_ids").map(String);
    const assigneeIds = form.getAll("assignee_ids").map(String);
    const tools = form.getAll("allowed_tools").map(String) as ToolName[];
    const connectionId = String(form.get("calendar_connection_id") ?? "").trim();
    const calendarId = String(form.get("calendar_id") ?? "").trim();
    const calendarTargets = connectionId && calendarId ? [{ connection_id: connectionId, calendar_id: calendarId }] : [];
    const expiry = new Date(String(form.get("expires_at")));
    if (!tools.length || (!contractIds.length && !calendarTargets.length)) { setValidationError("Select an allowed tool and at least one retained contract or exact calendar target."); return; }
    if (tools.includes("workspace.tasks.create") && (!contractIds.length || !assigneeIds.length || !tools.includes("documents.retrieve"))) { setValidationError("Task creation requires retained contracts, permitted assignees, and both task workflow tools."); return; }
    if (Boolean(connectionId) !== Boolean(calendarId) || /[\s*]/.test(calendarId) || (tools.includes("google_calendar.events.create") && !calendarTargets.length)) { setValidationError("Calendar creation requires an exact OAuth connection ID and calendar ID without whitespace or wildcards."); return; }
    if (!Number.isFinite(expiry.valueOf()) || expiry.valueOf() <= Date.now() || expiry.valueOf() > Date.now() + 365 * 86400000) { setValidationError("Choose an expiry in the next 365 days."); return; }
    setValidationError("");
    mutation.mutate({ name: String(form.get("name")).trim(), contract_ids: contractIds, assignee_ids: assigneeIds, ...(calendarTargets.length ? { calendar_targets: calendarTargets } : {}), allowed_tools: tools, expires_at: expiry.toISOString(), require_approval: form.has("require_approval"), max_actions_per_run: Number(form.get("max_actions_per_run")) });
  }

  if (credential) return <OneTimeCredential token={credential} dismiss={() => { setCredential(null); mutation.reset(); close(); }} />;
  const optionsError = contracts.error ?? members.error;
  const retained = (contracts.data ?? []).filter((contract) => contract.retain_source_text);

  return <section className="agent-create panel" aria-labelledby="agent-create-heading">
    <div className="agent-section-heading"><div><h2 id="agent-create-heading">Delegate a bounded workflow</h2><p>Choose explicit permissions. The external agent plans; LensLayer authorizes, executes, and verifies the action.</p></div><button className="button secondary" type="button" onClick={close}>Close</button></div>
    <form onSubmit={submit}>
      <fieldset disabled={mutation.isPending || contracts.isPending || members.isPending || Boolean(optionsError)} className="agent-form-fields">
        <div className="agent-form-grid">
          <div className="field"><label htmlFor="agent-name">Agent name</label><input className="input" id="agent-name" name="name" required minLength={1} maxLength={255} placeholder="Renewal assistant" /></div>
          <div className="field"><label htmlFor="agent-expiry">Expiry (your local time)</label><input className="input" id="agent-expiry" name="expires_at" type="datetime-local" required aria-describedby="agent-expiry-help" /><p id="agent-expiry-help" className="field-help">Converted to UTC before submission. Maximum 365 days.</p></div>
          <div className="field"><label htmlFor="agent-budget">Maximum actions per run</label><input className="input" id="agent-budget" name="max_actions_per_run" type="number" min={1} max={20} defaultValue={1} required /></div>
        </div>
        <fieldset className="agent-scope"><legend>Allowed tools</legend><label><input type="checkbox" name="allowed_tools" value="documents.retrieve" defaultChecked /><span>Retrieve retained source evidence <code>documents.retrieve</code></span></label><label><input type="checkbox" name="allowed_tools" value="workspace.tasks.create" defaultChecked /><span>Create an assigned follow-up task <code>workspace.tasks.create</code></span></label><label><input type="checkbox" name="allowed_tools" value="google_calendar.events.create" /><span>Create a private timed calendar event <code>google_calendar.events.create</code></span></label><p>The task workflow requires both task tools. Calendar-only scope can leave contracts and assignees empty; document-backed calendar events also need retrieval scope.</p></fieldset>
        <div className="agent-form-grid">
          <fieldset className="agent-scope"><legend>Retained contracts</legend>{retained.map((contract) => <label key={contract.id}><input type="checkbox" name="contract_ids" value={contract.id} /><span>{contract.title || contract.source_name}<small>{contract.id}</small></span></label>)}{!retained.length && <p>Upload a contract with source-text retention enabled before delegating this workflow.</p>}</fieldset>
          <fieldset className="agent-scope"><legend>Permitted assignees</legend>{(members.data ?? []).map((member) => <label key={member.user_id}><input type="checkbox" name="assignee_ids" value={member.user_id} /><span>{member.display_name || member.email}<small>{member.user_id}</small></span></label>)}</fieldset>
        </div>
        <fieldset className="agent-scope"><legend>Exact calendar target (optional)</legend><div className="agent-form-grid"><div className="field"><label htmlFor="calendar-connection-id">Calendar OAuth connection ID</label><input className="input" id="calendar-connection-id" name="calendar_connection_id" maxLength={64} /></div><div className="field"><label htmlFor="calendar-id">Calendar ID</label><input className="input" id="calendar-id" name="calendar_id" maxLength={1024} /></div></div><p>Connect an owned calendar in <Link href="/settings#calendar-connection">Calendar settings</Link>, then use the displayed IDs. The server validates the exact pair against its original grant. Reconnect requires a new connection ID.</p></fieldset>
        <label className="agent-policy-choice"><input type="checkbox" name="require_approval" defaultChecked /><span><strong>Require human approval</strong><small>An owner or administrator must approve each immutable action proposal before dispatch. Unchecking permits delegated writes without a human approval.</small></span></label>
        <button className="button" type="submit">{mutation.isPending ? "Creating credential…" : "Create agent credential"}</button>
      </fieldset>
      {optionsError && <p className="form-error" role="alert">Scope choices could not load: {optionsError.message}</p>}
      {mutation.isPending && <p className="agent-notice">If you leave while creation is pending, the server may still create the delegation. Check the list and revoke any credential you could not save; creation is not automatically retried.</p>}
      {(validationError || mutation.error) && <p className="form-error" role="alert">{validationError || mutation.error?.message}</p>}
      {mutation.isSuccess && !credential && <p className="agent-notice">The credential display was cleared. If it was not saved, revoke that delegation before creating another.</p>}
    </form>
  </section>;
}
