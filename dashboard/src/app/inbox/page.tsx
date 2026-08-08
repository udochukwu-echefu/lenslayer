"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Inbox, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ContractList } from "@/components/contract-list";
import { EmptyContracts, PageError, PageLoading } from "@/components/page-states";
import { TaskList } from "@/components/task-list";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import { dueAtEndOfDay, isOverdue } from "@/lib/utils";
import { verificationTone } from "@/lib/verification";

export default function InboxPage() {
  const [now] = useState(() => Date.now());
  const { activeOrganization } = useWorkspace();
  const query = useQuery({ queryKey: ["contracts", activeOrganization?.id], queryFn: () => api.contracts(activeOrganization!.id), enabled: Boolean(activeOrganization), refetchInterval: (state) => state.state.data?.some((item) => ["queued", "processing", "running"].includes(item.status)) ? 5000 : false });
  const taskQuery = useQuery({ queryKey: ["tasks", activeOrganization?.id], queryFn: () => api.tasks(activeOrganization!.id), enabled: Boolean(activeOrganization) });
  const verificationQuery = useQuery({ queryKey: ["verification-cases", activeOrganization?.id], queryFn: () => api.verificationCases(activeOrganization!.id), enabled: Boolean(activeOrganization) });
  const work = (query.data ?? []).filter((item) => ["queued", "processing", "running", "failed", "ready"].includes(item.status));
  const moving = work.filter((item) => ["queued", "processing", "running"].includes(item.status));
  const ready = work.filter((item) => item.status === "ready");
  const blocked = work.filter((item) => item.status === "failed");
  const activeTasks = (taskQuery.data ?? []).filter((task) => ["open", "in_progress"].includes(task.status));
  const overdue = activeTasks.filter((task) => isOverdue(task.due_at, now));
  const nextWeek = now + 7 * 86_400_000;
  const dueSoon = activeTasks.filter((task) => {
    const due = dueAtEndOfDay(task.due_at);
    return due !== null && due >= now && due <= nextWeek;
  });
  const pendingCases = (verificationQuery.data ?? []).filter((item) => item.status === "pending");
  return <div className="page"><div className="page-heading"><div><p className="eyebrow">Workspace inbox</p><h1 className="page-title">Work in motion.</h1><p className="page-description">See overdue actions, near-term due dates, completed reviews, and processing problems in one decision queue.</p></div></div>
    {(query.isLoading || taskQuery.isLoading || verificationQuery.isLoading) ? <PageLoading rows={7} /> : query.error ? <PageError error={query.error} /> : taskQuery.error ? <PageError error={taskQuery.error} /> : verificationQuery.error ? <PageError error={verificationQuery.error} /> : (!work.length && !overdue.length && !dueSoon.length && !pendingCases.length) ? <div className="panel"><EmptyContracts compact /></div> : <div className="inbox-sections">
      {overdue.length > 0 && <section><div className="section-heading"><h2>Overdue actions <span className="count danger-count">{overdue.length}</span></h2><p><TriangleAlert size={13} />Needs a human update</p></div><TaskList tasks={overdue} /></section>}
      {dueSoon.length > 0 && <section><div className="section-heading"><h2>Due in the next 7 days <span className="count">{dueSoon.length}</span></h2></div><TaskList tasks={dueSoon} /></section>}
      {pendingCases.length > 0 && <section><div className="section-heading"><h2>Verification decisions <span className="count">{pendingCases.length}</span></h2><p><ShieldCheck size={13} />Synthetic review queue</p></div><div className="inbox-verification-list">{pendingCases.map((item) => <Link href={`/verify/${item.id}`} key={item.id}><span className={`verify-score ${item.risk_score >= 70 ? "high" : item.risk_score >= 20 ? "medium" : "low"}`}><strong>{item.risk_score}</strong><small>/100</small></span><div><strong>{item.applicant_name}</strong><p>{item.reference} · {item.finding_count} discrepancies</p></div><span className={`pill ${verificationTone(item.suggested_action)}`}>{item.suggested_action}</span><ArrowRight size={15} /></Link>)}</div></section>}
      <section><div className="section-heading"><h2>Ready for a decision <span className="count">{ready.length}</span></h2></div>{ready.length ? <ContractList contracts={ready} /> : <EmptyContracts compact />}</section>
      <section><div className="section-heading"><h2>Processing <span className="count">{moving.length}</span></h2><p>Updates automatically</p></div>{moving.length ? <ContractList contracts={moving} /> : <div className="quiet-empty"><Inbox size={16} />No active processing jobs</div>}</section>
      {blocked.length > 0 && <section><div className="section-heading"><h2>Blocked <span className="count danger-count">{blocked.length}</span></h2></div><ContractList contracts={blocked} /></section>}
    </div>}
  </div>;
}
