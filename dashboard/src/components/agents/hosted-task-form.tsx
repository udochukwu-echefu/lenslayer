"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { NativeSelect } from "../native-select";
import { api, ApiError } from "@/lib/api";
import { assignmentInput } from "@/lib/hosted-agent-assignment";
import { calendarGrants, goalLabels, plannerLabels, retainedContract } from "@/lib/hosted-agent-state";
import type { HostedAgentCapabilities, HostedAgentTask, HostedAgentTaskCreate, HostedGoalType, HostedPlannerMode } from "@/lib/hosted-agent-types";

export function HostedTaskForm({ organizationId, scopeKey, capabilities, assigned, savedRequest, saveRequest }: {
  organizationId: string; scopeKey: string; capabilities: HostedAgentCapabilities; assigned: (task: HostedAgentTask) => void;
  savedRequest: HostedAgentTaskCreate | null; saveRequest: (request: HostedAgentTaskCreate | null) => void;
}) {
  const client = useQueryClient();
  const [goalType, setGoalType] = useState<HostedGoalType | "">(savedRequest?.goal_type ?? "");
  const [mode, setMode] = useState<HostedPlannerMode>(savedRequest?.planner_mode ?? "deterministic");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [frozen, setFrozen] = useState<HostedAgentTaskCreate | null>(savedRequest);
  const intent = useRef<HostedAgentTaskCreate | null>(savedRequest);
  const [rejected, setRejected] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const document = goalType !== "" && goalType !== "calendar-event";
  const calendar = goalType === "calendar-event" || goalType === "follow-up-and-calendar";
  const contracts = useQuery({ queryKey: ["hosted-scope", scopeKey, "contracts"], queryFn: ({ signal }) => api.contracts(organizationId, { signal, privateWorkspace: true }), enabled: document, retry: false });
  const members = useQuery({ queryKey: ["hosted-scope", scopeKey, "members"], queryFn: ({ signal }) => api.members(organizationId, { signal, privateWorkspace: true }), enabled: document, retry: false });
  const connections = useQuery({ queryKey: ["hosted-scope", scopeKey, "connections"], queryFn: ({ signal }) => api.integrations(organizationId, "google_calendar", { signal, privateWorkspace: true }), enabled: calendar, retry: false });
  const sourceError = (document && (contracts.error ?? members.error)) || (calendar && connections.error);
  const loading = (document && (contracts.isPending || members.isPending)) || (calendar && connections.isPending);
  const grants = calendarGrants(connections.data ?? [], organizationId);
  const locked = busy || Boolean(frozen);

  useEffect(() => {
    alive.current = true;
    const leave = () => {
      pending.current?.abort(); pending.current = null;
      setBusy(false);
      setError("Submission was interrupted. It may have been recorded. Inspect assignments, or retry the identical saved request; do not create a new key.");
    };
    window.addEventListener("pagehide", leave);
    return () => { alive.current = false; pending.current?.abort(); window.removeEventListener("pagehide", leave); };
  }, []);

  async function send(input: HostedAgentTaskCreate) {
    if (pending.current) return;
    if (!capabilities.enabled || !capabilities.goal_types.includes(input.goal_type) || !capabilities.planner_modes.includes(input.planner_mode ?? "deterministic")) {
      setError("The saved goal or planning mode is no longer enabled. Inspect history and capabilities; no substitute planning mode was selected."); return;
    }
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(""); setRejected(false);
    try {
      const task = await api.createHostedAgentTask(organizationId, input, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      if (task.organization_id !== organizationId) throw new Error("Assignment response did not match the selected workspace.");
      await client.invalidateQueries({ queryKey: ["hosted-tasks", scopeKey] });
      if (alive.current && !controller.signal.aborted) assigned(task);
    } catch (cause) {
      if (!alive.current || controller.signal.aborted) return;
      const definiteRejection = cause instanceof ApiError && [400, 422].includes(cause.status);
      setRejected(definiteRejection);
      setError(definiteRejection ? `${cause.message} No assignment was accepted; correct the rejected request.` : cause instanceof ApiError && cause.status === 409 ? "The key is bound to a different request or state. Inspect existing assignments; changing the key is not a safe retry." : "Assignment could not be confirmed. It may already exist. Retry only this identical request with its original key, or inspect the assignment list.");
    } finally {
      if (pending.current === controller) pending.current = null;
      if (alive.current && !controller.signal.aborted) setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (intent.current || locked || sourceError || loading) return;
    try {
      const input = assignmentInput(new FormData(event.currentTarget), { organizationId, capabilities, contracts: contracts.data ?? [], members: members.data ?? [], connections: connections.data ?? [] }, crypto.randomUUID());
      intent.current = input; setFrozen(input); saveRequest(input); void send(input);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Check the exact scope and required facts."); }
  }

  return <section className="agent-create panel hosted-assignment" aria-labelledby="assignment-heading">
    <div className="agent-section-heading"><div><h2 id="assignment-heading">Assign a bounded goal</h2><p>Choose the facts and exact targets. LensLayer prepares proposals; an owner or administrator must approve each action in Runs before dispatch.</p></div></div>
    <form onSubmit={submit}>
      <fieldset className="agent-form-fields" disabled={locked}>
        <div className="agent-form-grid">
          <div className="field"><label htmlFor="hosted-goal-type">Outcome to create</label><NativeSelect id="hosted-goal-type" className="input" name="goal_type" required value={goalType} onChange={(event) => setGoalType(event.target.value as HostedGoalType)}><option value="" disabled>Select an outcome</option>{Object.entries(goalLabels).filter(([type]) => capabilities.goal_types.includes(type as HostedGoalType)).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</NativeSelect></div>
          <div className="field"><label htmlFor="hosted-planner">Planning mode</label><NativeSelect id="hosted-planner" className="input" name="planner_mode" value={mode} onChange={(event) => setMode(event.target.value as HostedPlannerMode)}><option value="deterministic" disabled={!capabilities.planner_modes.includes("deterministic")}>{plannerLabels.deterministic}</option>{capabilities.planner_modes.includes("model") && <option value="model">{plannerLabels.model}</option>}</NativeSelect><p className="field-help">{mode === "deterministic" ? "Fixed workflow planning uses your explicit facts. It does not call a model or interpret legal meaning." : "Optional model assistance cannot change your title, facts, targets or approval policy."}{!capabilities.planner_modes.includes("model") && " Model assistance is not enabled by this service."}</p></div>
        </div>
        {capabilities.planner_modes.includes("model") && <p className="field-help">Choosing model assistance shares your goal, scoped facts and any retrieved document excerpt with OpenAI GPT-6.1 Sol at high effort, using separate server product API access. Fixed workflow planning does not send this context to a model.</p>}
        {mode === "model" && <label className="agent-policy-choice"><input type="checkbox" name="excerpt_consent" required /><span><strong>Share this scoped context with the product model provider</strong><small>Your human-authored goal, scoped facts and any retrieved document excerpt will be sent to OpenAI GPT-6.1 Sol at high effort using separate server product API access. Never include secrets. This is not a zero-retention guarantee or legal review. Approval is still required.</small></span></label>}
        <div className="field"><label htmlFor="hosted-goal">Your goal</label><textarea className="textarea" id="hosted-goal" name="goal" required maxLength={4000} placeholder="Describe what this exact follow-up or event should help you review." /><p className="field-help">Goal text is context, not permission for additional actions. All identities, dates, titles and targets below are your explicit facts.</p></div>
        {document && <section className="hosted-facts" aria-labelledby="document-facts-heading"><h3 id="document-facts-heading">Document follow-up facts</h3>
          <div className="agent-form-grid">
            <div className="field"><label htmlFor="hosted-contract">Retained source contract</label><NativeSelect className="input" id="hosted-contract" name="contract_id" required defaultValue=""><option value="" disabled>Select a retained source</option>{(contracts.error ? [] : contracts.data ?? []).filter((item) => item.organization_id === organizationId).map((item) => <option value={item.id} key={item.id} disabled={!retainedContract(item)}>{item.title || item.source_name}{!retainedContract(item) ? " — source unavailable or expired" : ""}</option>)}</NativeSelect><p className="field-help">The worker uses the latest retained version and verifies its source identity. {contracts.data && !contracts.data.some((item) => retainedContract(item)) && <><Link href="/contracts/new">Upload a source with text retention</Link> before assigning.</>}</p></div>
            <div className="field"><label htmlFor="hosted-assignee">Follow-up assignee</label><NativeSelect className="input" id="hosted-assignee" name="assignee_id" required defaultValue=""><option value="" disabled>Select a workspace member</option>{(members.error ? [] : members.data ?? []).map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name || member.email} — {member.email}</option>)}</NativeSelect></div>
            <div className="field"><label htmlFor="hosted-query">Literal evidence phrase</label><input className="input" id="hosted-query" name="query" required minLength={2} maxLength={200} placeholder="A phrase actually present in the retained source" /><p className="field-help">Case-insensitive phrase retrieval, not semantic search. No phrase or source interpretation is inferred.</p></div>
            <div className="field"><label htmlFor="hosted-due">Follow-up due time (with timezone)</label><input className="input" id="hosted-due" name="due_at" required placeholder="YYYY-MM-DDTHH:mm:ssZ or ±HH:MM" aria-describedby="hosted-times-help" /></div>
            <div className="field hosted-wide"><label htmlFor="hosted-title">Exact follow-up title</label><input className="input" id="hosted-title" name="task_title" required maxLength={512} /></div>
            <div className="field hosted-wide"><label htmlFor="hosted-description">Exact follow-up description (optional)</label><textarea className="textarea" id="hosted-description" name="task_description" maxLength={4000} /></div>
          </div>
        </section>}
        {calendar && <section className="hosted-facts" aria-labelledby="calendar-facts-heading"><h3 id="calendar-facts-heading">Calendar event facts</h3>
          <div className="agent-form-grid">
            <div className="field hosted-wide"><label htmlFor="hosted-calendar">Exact connected calendar grant</label><NativeSelect className="input" id="hosted-calendar" name="calendar_target" required defaultValue=""><option value="" disabled>Select a connection and calendar</option>{(connections.error ? [] : grants).map((grant) => <option key={grant.value} value={grant.value}>{grant.connection.display_name} — {grant.calendarId} ({grant.connection.id})</option>)}</NativeSelect><p className="field-help">Only active Google OAuth connections and their original exact owned-calendar IDs are selectable. Stored consent is checked again at dispatch. {!connections.isPending && !grants.length && <Link href="/settings#calendar-connection">Connect an owned calendar in Settings</Link>}</p></div>
            <div className="field hosted-wide"><label htmlFor="hosted-summary">Exact event summary</label><input className="input" id="hosted-summary" name="summary" required maxLength={512} /></div>
            <div className="field"><label htmlFor="hosted-start">Event start (with timezone)</label><input className="input" id="hosted-start" name="start_at" required placeholder="YYYY-MM-DDTHH:mm:ssZ or ±HH:MM" aria-describedby="hosted-times-help" /></div>
            <div className="field"><label htmlFor="hosted-end">Event end (with timezone)</label><input className="input" id="hosted-end" name="end_at" required placeholder="YYYY-MM-DDTHH:mm:ssZ or ±HH:MM" aria-describedby="hosted-times-help" /></div>
          </div><p className="field-help">One private timed event, positive duration up to 31 days. No attendees, recurrence or arbitrary provider options. {goalType === "calendar-event" ? "No document or assignee is delegated." : "Both named outcomes need their own approval and verified receipt; one completed action is not whole-goal success."}</p>
        </section>}
        <div className="field"><label htmlFor="hosted-deadline">Execution deadline (with timezone)</label><input className="input" id="hosted-deadline" name="deadline_at" required placeholder="YYYY-MM-DDTHH:mm:ssZ or ±HH:MM" aria-describedby="hosted-deadline-help hosted-times-help" /><p id="hosted-deadline-help" className="field-help">Future deadline, at most {Math.min(7, capabilities.max_deadline_days)} days. This is the execution/approval limit, separate from the follow-up due time or event time.</p></div>
        <p id="hosted-times-help" className="field-help">Supply ISO timestamps with Z (UTC) or an explicit offset. Your browser timezone is never assumed. Times normalize to UTC.</p>
        <p className="agent-notice"><strong>Human approval always required.</strong> Assignment creates an internal delegation limited to these exact facts and deadline. No bearer credential enters the browser. Approve proposals in Runs; completion requires matching server read-back receipts.</p>
        <button type="submit" className="button" disabled={!goalType || loading || Boolean(sourceError) || !capabilities.planner_modes.includes(mode)}>Assign to LensLayer agent</button>
      </fieldset>
    </form>
    {loading && !frozen && <p role="status" className="field-help">Loading private scope choices…</p>}
    {sourceError && !frozen && <div role="alert" className="hosted-form-error"><p>Scope choices could not load. No sample targets were substituted.</p><button type="button" className="button secondary" onClick={() => { if (document) { void contracts.refetch(); void members.refetch(); } if (calendar) void connections.refetch(); }}>Reload scope choices</button></div>}
    {busy && <p role="status" className="agent-notice">Recording assignment… Leaving or switching identity/workspace stops this browser request, not necessarily server acceptance. Inspect assignments before creating another.</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {frozen && !busy && <div className="agent-controls"><button type="button" className="button secondary" onClick={() => void send(frozen)}>Retry identical assignment</button>{rejected && <button type="button" className="button secondary" onClick={() => { intent.current = null; setFrozen(null); saveRequest(null); setError(""); setRejected(false); }}>Edit rejected request</button>}<code>Request key: {frozen.idempotency_key}</code></div>}
    {frozen && <details className="agent-json"><summary>Exact saved assignment request</summary><pre>{JSON.stringify(frozen, null, 2)}</pre></details>}
  </section>;
}
