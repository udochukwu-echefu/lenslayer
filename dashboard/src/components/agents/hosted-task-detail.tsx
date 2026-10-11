"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { hostedTaskPollInterval, isTerminalHostedTask } from "@/lib/hosted-agent-state";
import { exactDateTime } from "@/lib/agent-state";
import { PageLoading } from "../page-states";
import { HostedTaskAccess } from "./hosted-task-access";
import { HostedTaskStatus } from "./hosted-task-status";
import { AgentViewError } from "./agent-view-state";
import "./agent-workspace.css";
import "./hosted-tasks.css";

export function HostedTaskDetail({ taskId }: { taskId: string }) {
  return <HostedTaskAccess>{(org, scopeKey) => <WorkspaceTask key={`${scopeKey}:${taskId}`} organizationId={org} scopeKey={scopeKey} taskId={taskId} />}</HostedTaskAccess>;
}
function WorkspaceTask({ organizationId, scopeKey, taskId }: { organizationId: string; scopeKey: string; taskId: string }) {
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const task = useQuery({ queryKey: ["hosted-task", scopeKey, taskId], queryFn: ({ signal }) => api.hostedAgentTask(organizationId, taskId, signal), retry: false, refetchInterval: (query) => query.state.error ? false : hostedTaskPollInterval(query.state.data ? [query.state.data] : undefined) });
  useEffect(() => () => { pending.current?.abort(); }, []);
  async function cancel() {
    if (pending.current || !task.data || isTerminalHostedTask(task.data.status) || task.error) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError("");
    try {
      const record = await api.cancelHostedAgentTask(organizationId, taskId, controller.signal);
      if (controller.signal.aborted) return;
      if (record.organization_id !== organizationId) throw new Error("scope_mismatch");
      client.setQueryData(["hosted-task", scopeKey, taskId], record); setConfirming(false);
      await client.invalidateQueries({ queryKey: ["hosted-tasks", scopeKey] });
    } catch { if (!controller.signal.aborted) setError("Cancellation could not be confirmed. Refresh the record before retrying. Completed or uncertain effects may remain."); }
    finally { if (!controller.signal.aborted) setBusy(false); if (pending.current === controller) pending.current = null; }
  }
  return <div className="page agent-page hosted-task-page"><Link className="agent-back-link" href="/agent-tasks">Back to agent tasks</Link><div className="page-heading"><div><h1 className="page-title">Agent task detail</h1><p className="page-description">Assignment status is separate from human approval and exact run receipts.</p></div><button type="button" className="button secondary" disabled={task.isFetching || busy} onClick={() => void task.refetch()}>Refresh assignment</button></div>
    {task.isPending && <PageLoading />}{task.error && <AgentViewError error={task.error} retry={() => void task.refetch()} />}
    {task.data && !task.error && <><HostedTaskStatus task={task.data} /><dl className="agent-facts"><div><dt>Assignment ID</dt><dd><code>{task.data.id}</code></dd></div><div><dt>Created by user</dt><dd><code>{task.data.created_by_user_id}</code></dd></div><div><dt>Created</dt><dd>{exactDateTime(task.data.created_at)}</dd></div><div><dt>Last recorded update</dt><dd>{exactDateTime(task.data.updated_at)}</dd></div>{task.data.completed_at && <div><dt>Closed</dt><dd>{exactDateTime(task.data.completed_at)}</dd></div>}</dl><p className="agent-notice">Read the run for immutable proposals, source identity, approval, factual inputs and verified receipts. Cancellation is not rollback; no deletion or compensation API exists.</p>{!isTerminalHostedTask(task.data.status) && <div className="agent-controls">{confirming ? <><p>Stop new hosted planning and dispatch? An already-created task or event remains. Inspect the run for partial effects.</p><button className="button danger" type="button" disabled={busy} onClick={() => void cancel()}>{busy ? "Cancelling…" : "Confirm cancellation"}</button><button className="button secondary" type="button" disabled={busy} onClick={() => setConfirming(false)}>Keep assignment</button></> : <button className="button secondary" type="button" onClick={() => setConfirming(true)}>Cancel assignment</button>}</div>}{error && <p className="form-error" role="alert">{error}</p>}</>}
  </div>;
}
