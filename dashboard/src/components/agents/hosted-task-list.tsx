"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { hostedTaskPollInterval } from "@/lib/hosted-agent-state";
import type { HostedAgentTask, HostedAgentTaskCreate } from "@/lib/hosted-agent-types";
import { PageLoading } from "../page-states";
import { HostedTaskAccess } from "./hosted-task-access";
import { HostedTaskForm } from "./hosted-task-form";
import { HostedTaskStatus } from "./hosted-task-status";
import { AgentViewError } from "./agent-view-state";
import "./agent-workspace.css";
import "./hosted-tasks.css";

export function HostedTaskList() {
  return <HostedTaskAccess>{(org, scopeKey) => <WorkspaceHostedTasks key={scopeKey} organizationId={org} scopeKey={scopeKey} />}</HostedTaskAccess>;
}

function WorkspaceHostedTasks({ organizationId, scopeKey }: { organizationId: string; scopeKey: string }) {
  const [accepted, setAccepted] = useState<HostedAgentTask | null>(null);
  const [savedRequest, saveRequest] = useState<HostedAgentTaskCreate | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const tasks = useQuery({ queryKey: ["hosted-tasks", scopeKey], queryFn: ({ signal }) => api.hostedAgentTasks(organizationId, 50, signal), retry: false, refetchInterval: (query) => query.state.error ? false : hostedTaskPollInterval(query.state.data) });
  const capabilities = useQuery({ queryKey: ["hosted-capabilities", scopeKey], queryFn: ({ signal }) => api.hostedAgentCapabilities(organizationId, signal), retry: false });
  // A failed authenticated read must not leave a cached private assignment visible.
  const accessError = tasks.error ?? capabilities.error;
  return <div className="page agent-page hosted-task-page">
    <div className="page-heading"><div><h1 className="page-title">Agent tasks</h1><p className="page-description">Assign a bounded goal to LensLayer, then inspect human approval and verified completion in the run ledger.</p></div><div className="agent-controls"><Link className="button secondary" href="/agents">External agent credentials</Link><button className="button secondary" disabled={tasks.isFetching || capabilities.isFetching} onClick={() => { void tasks.refetch(); void capabilities.refetch(); }}>Refresh assignments</button></div></div>
    <p className="agent-footnote">Document follow-up, a private Calendar event, or both. You supply the exact facts; fixed workflow planning is not a model or a legal interpretation. No browser bearer credential is required.</p>
    {accessError && <AgentViewError error={accessError} retry={() => { void tasks.refetch(); void capabilities.refetch(); }} />}
    {!accessError && (tasks.isPending || capabilities.isPending) && <PageLoading />}
    {!accessError && !tasks.isPending && capabilities.data && <>
      {!capabilities.data.enabled ? <p className="agent-notice">Hosted assignments are disabled by this service. Existing records remain inspectable. No external client or sample execution has been substituted.</p> : accepted ? <section className="hosted-assignment panel" aria-labelledby="accepted-heading"><h2 id="accepted-heading">Assignment recorded</h2><HostedTaskStatus task={tasks.data?.find((task) => task.id === accepted.id) ?? accepted} /><div className="agent-controls"><Link className="button" href={`/agent-tasks/${encodeURIComponent(accepted.id)}`}>Track assignment</Link><button type="button" className="button secondary" onClick={() => { setAccepted(null); saveRequest(null); setFormVersion((value) => value + 1); }}>Assign another goal</button></div></section> : <HostedTaskForm key={formVersion} organizationId={organizationId} scopeKey={scopeKey} capabilities={capabilities.data} assigned={setAccepted} savedRequest={savedRequest} saveRequest={saveRequest} />}
      <section className="hosted-history" aria-labelledby="hosted-history-heading"><div className="section-heading"><h2 id="hosted-history-heading">Recent assignments</h2><p>Latest 50 at most · private workspace</p></div>{tasks.data?.length ? <div className="hosted-records">{tasks.data.map((task) => <article className="hosted-record" key={task.id}><HostedTaskStatus task={task} /><Link href={`/agent-tasks/${encodeURIComponent(task.id)}`}>Track assignment <span className="sr-only">{task.goal}</span></Link></article>)}</div> : <div className="inline-state"><div><h3>No hosted assignments yet</h3><p>Assign a goal with exact facts above. Queued planning or approval is not proof that a task or event exists.</p></div></div>}</section>
    </>}
  </div>;
}
