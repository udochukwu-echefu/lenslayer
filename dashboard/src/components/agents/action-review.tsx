"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { agentErrorNote, canAdministerAgents, canDecideAction, exactDateTime } from "@/lib/agent-state";
import { isCalendarAction, isTaskAction } from "@/lib/agent-shapes";
import type { AgentAction, AgentRun, ApprovalDecision, RunEvent } from "@/lib/agent-types";
import { useWorkspace } from "../workspace-provider";
import { StatusBadge } from "../ui/status-badge";
import { useBoundaryClock } from "./use-boundary-clock";
import { ActionEvidence } from "./action-evidence";

export function ActionReview({ organizationId, run, action, events }: { organizationId: string; run: AgentRun; action: AgentAction; events: RunEvent[] }) {
  const { activeRole, isDemo } = useWorkspace();
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const now = useBoundaryClock([run.deadline_at, action.approval_expires_at]);
  const canDecide = canDecideAction(activeRole, isDemo, run, action, now);
  const task = isTaskAction(action) ? action.input : undefined;
  const calendar = isCalendarAction(action) ? action.input : undefined;
  const evidenceId = task?.evidence_id ?? calendar?.evidence_id;
  const evidence = evidenceId ? events.find((event) => event.type === "evidence.retrieved" && event.data.evidence_id === evidenceId) : undefined;
  const mutation = useMutation({ mutationFn: (input: ApprovalDecision) => api.decideAgentAction(organizationId, run.id, action.id, input), retry: false, onSuccess: async () => {
    setReason("");
    await client.invalidateQueries({ queryKey: ["agent-run", organizationId, run.id] });
    await client.invalidateQueries({ queryKey: ["agent-runs", organizationId] });
  } });
  const reconciliation = useMutation({ mutationFn: () => api.reconcileAgentAction(organizationId, run.id, action.id), retry: false, onSuccess: () => client.invalidateQueries({ queryKey: ["agent-run", organizationId, run.id] }) });

  return <article className="agent-action panel" aria-labelledby={`action-${action.id}`}>
    <header className="agent-section-heading"><div><h3 id={`action-${action.id}`}>{task?.title ?? calendar?.summary ?? "Unsupported action input"}</h3><p><code>{action.tool}</code> · Version {action.tool_version} · {action.attempts} {action.attempts === 1 ? "attempt" : "attempts"}</p></div><StatusBadge status={action.status} /></header>
    {!task && !calendar && <p className="agent-notice" role="alert">This tool/version or input is not recognized. Approval is disabled; inspect the exact recorded input without assuming a target or completion.</p>}
    <dl className="agent-facts">
      {task && <><div><dt>Exact target contract</dt><dd><Link href={`/contracts/${encodeURIComponent(task.contract_id)}`}>{task.contract_id}</Link></dd></div><div><dt>Assignee user ID</dt><dd><code>{task.assigned_to_user_id}</code></dd></div><div><dt>Due date</dt><dd><time dateTime={task.due_at}>{exactDateTime(task.due_at)}</time><code>{task.due_at}</code></dd></div></>}
      {calendar && <><div><dt>Exact connection</dt><dd><code>{calendar.connection_id}</code></dd></div><div><dt>Exact calendar</dt><dd><code>{calendar.calendar_id}</code></dd></div><div><dt>Event summary</dt><dd>{calendar.summary}</dd></div><div><dt>Exact start</dt><dd><time dateTime={calendar.start_at}>{exactDateTime(calendar.start_at)}</time><code>{calendar.start_at}</code></dd></div><div><dt>Exact end</dt><dd><time dateTime={calendar.end_at}>{exactDateTime(calendar.end_at)}</time><code>{calendar.end_at}</code></dd></div><div><dt>Provenance</dt><dd>{calendar.contract_id ? <Link href={`/contracts/${encodeURIComponent(calendar.contract_id)}`}>{calendar.contract_id}</Link> : "Approved action; no document source"}</dd></div></>}
      {evidenceId && <div><dt>Evidence receipt</dt><dd><code>{evidenceId}</code></dd></div>}
      {(task?.condition_id || calendar?.condition_id) && <div><dt>Named condition</dt><dd><code>{task?.condition_id ?? calendar?.condition_id}</code></dd></div>}
      <div><dt>Approval</dt><dd>{action.approval_status.replaceAll("_", " ")}{action.approved_by_user_id && <span>By {action.approved_by_user_id}</span>}</dd></div>
      <div><dt>Approval expiry</dt><dd>{action.approval_expires_at ? <time dateTime={action.approval_expires_at}>{exactDateTime(action.approval_expires_at)}{Date.parse(action.approval_expires_at) <= now && " (elapsed)"}</time> : "Not required"}</dd></div>
    </dl>
    {evidenceId && <ActionEvidence organizationId={organizationId} runId={run.id} evidenceId={evidenceId} isDemo={isDemo} />}
    {evidence && <p className="agent-footnote">Retrieval event #{evidence.sequence} recorded source version {String(evidence.data.version_id ?? "not supplied")}.</p>}
    <div className="agent-input-binding"><h4>Immutable input SHA-256</h4><code>{action.input_sha256}</code><p>Approval applies only to this recorded input. Each named condition reserves one immutable action. To change a proposed field, start a new authorized run; another proposal for the same condition cannot replace it.</p></div>
    <details className="agent-json"><summary>Exact immutable input</summary><pre>{JSON.stringify(action.input, null, 2)}</pre></details>
    {task?.deadline_basis && <p className="agent-notice">Caller-supplied date basis: renewal on {task.deadline_basis.renewal_date}, {task.deadline_basis.notice_days} notice days. LensLayer checks arithmetic against the due date in UTC, not the legal meaning of the clause.</p>}
    {action.approval_reason && <p className="agent-footnote"><strong>Decision reason:</strong> {action.approval_reason}</p>}
    {canDecide ? <form className="agent-approval-form" onSubmit={(event) => { event.preventDefault(); if (canDecide && reason.trim()) mutation.mutate({ decision: "approved", reason: reason.trim() }); }}>
      <div className="field"><label htmlFor={`reason-${action.id}`}>Approval or rejection reason</label><textarea id={`reason-${action.id}`} className="textarea" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} required placeholder="Explain the decision for this exact target, assignee, due date, and evidence." /></div>
      <div className="agent-controls"><button type="submit" className="button" disabled={mutation.isPending || !reason.trim()}>{mutation.isPending ? "Recording decision…" : calendar ? "Approve exact event" : "Approve exact task"}</button><button type="button" className="button danger" disabled={mutation.isPending || !reason.trim()} onClick={() => { if (canDecide && reason.trim()) mutation.mutate({ decision: "rejected", reason: reason.trim() }); }}>{calendar ? "Reject event" : "Reject task"}</button></div>
      <p className="field-help">{calendar ? "Approval permits one private timed event on this exact calendar. No attendees, recurrence or arbitrary provider options. Provider access is rechecked at dispatch." : "Approval permits the worker to create this internal task. It does not send a renewal notice or approve a legal interpretation."}</p>
    </form> : action.status === "awaiting_approval" && <p className="agent-notice">{isDemo ? "Synthetic demo: decisions are disabled." : Date.parse(run.deadline_at) <= now ? "The run deadline elapsed; approval is unavailable." : action.approval_expires_at && Date.parse(action.approval_expires_at) <= now ? "The approval window expired; this invocation can no longer be approved." : "An authorized workspace owner or administrator must resolve this approval."}</p>}
    {mutation.error && <p className="form-error" role="alert">{mutation.error.message}</p>}
    {action.error_code && <p className="form-error" role="alert"><strong>{action.error_code}:</strong> {agentErrorNote(action.error_code)}</p>}
    {(action.status === "unknown_outcome" || action.result.dispatch_may_have_effect === true) && <p className="agent-notice" role="alert">Unknown remote effect: an event may already exist. Do not submit another write. Reconciliation reads the stable event ID only and does not reopen a terminal run or perform an insert.</p>}
    {action.result.partial_effect === true && <p className="agent-notice" role="alert">Partial effect recorded: this action created a verified object despite cancellation or incomplete workflow progress. Cancellation did not delete it. No compensation/deletion API is implemented.</p>}
    {calendar && action.status === "unknown_outcome" && canAdministerAgents(activeRole, isDemo) && <button type="button" className="button secondary" disabled={reconciliation.isPending} onClick={() => reconciliation.mutate()}>{reconciliation.isPending ? "Requesting read-back…" : "Request read-back reconciliation"}</button>}
    {reconciliation.error && <p className="form-error" role="alert">{reconciliation.error.message}</p>}
    {Object.keys(action.result).length > 0 && <details className="agent-json"><summary>Recorded action result</summary><pre>{JSON.stringify(action.result, null, 2)}</pre></details>}
  </article>;
}
