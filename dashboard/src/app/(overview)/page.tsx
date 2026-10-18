"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, CircleCheckBig, Files, ListChecks, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ContractList } from "@/components/contract-list";
import { EmptyContracts, PageError, PageLoading } from "@/components/page-states";
import { TaskList } from "@/components/task-list";
import { TableCard } from "@/components/ui/table-card";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import type { Contract } from "@/lib/types";
import { dueAtEndOfDay } from "@/lib/utils";

function needsAttention(contract: Contract) { return ["failed", "ready"].includes(contract.status); }

export default function TodayPage() {
  const [now] = useState(() => Date.now());
  const { activeOrganization, canUpload, isDemo, user } = useWorkspace();
  const query = useQuery({ queryKey: ["contracts", activeOrganization?.id], queryFn: () => api.contracts(activeOrganization!.id), enabled: Boolean(activeOrganization) });
  const taskQuery = useQuery({ queryKey: ["tasks", activeOrganization?.id], queryFn: () => api.tasks(activeOrganization!.id), enabled: Boolean(activeOrganization) });
  const lifecycleQuery = useQuery({ queryKey: ["lifecycle", activeOrganization?.id], queryFn: () => api.lifecycle(activeOrganization!.id, { status: "active" }), enabled: Boolean(activeOrganization) });
  const contracts = query.data ?? [];
  const attention = contracts.filter(needsAttention);
  const ready = contracts.filter((contract) => contract.status === "ready");
  const failed = contracts.filter((contract) => contract.status === "failed");
  const activeTasks = (taskQuery.data ?? []).filter((task) => ["open", "in_progress"].includes(task.status));
  const myTasks = (isDemo ? activeTasks : activeTasks.filter((task) => task.assigned_to_user_id === user?.id)).slice(0, 5);
  const overdueTasks = activeTasks.filter((task) => {
    const due = dueAtEndOfDay(task.due_at);
    return due !== null && due < now;
  });
  const upcomingNoticeDeadlines = (lifecycleQuery.data ?? []).filter((item) => ["notice", "renewal"].includes(item.kind) && new Date(item.due_at).getTime() >= now);
  const upcomingTasks = activeTasks.filter((task) => {
    const due = dueAtEndOfDay(task.due_at);
    return due !== null && due >= now;
  }).sort((a,b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
  const upcoming = upcomingTasks.slice(0, 4);

  return (
    <div className="page today-page">
      <div className="page-heading">
        <div><h1 className="page-title">Workspace overview</h1><p className="page-description">Reviews, processing issues, and verified dates that need a human next step.</p></div>
        {canUpload && <Link href="/contracts/new" className="button"><Upload size={16} />Upload contract</Link>}
      </div>

      <section className="workspace-stats" aria-label="Workspace statistics">
        <Link href="/contracts"><span className="workspace-stat-label">Contracts</span><strong>{query.isLoading ? "—" : contracts.length}</strong><small>{failed.length ? `${failed.length} processing ${failed.length === 1 ? "failure" : "failures"}` : "Across this workspace"}</small><span className="workspace-stat-icon"><Files size={18} /></span></Link>
        <Link href="/inbox"><span className="workspace-stat-label">Ready for decision</span><strong>{query.isLoading ? "—" : ready.length}</strong><small>{ready.length ? "Human review required" : "Decision queue is clear"}</small><span className="workspace-stat-icon"><CircleCheckBig size={18} /></span></Link>
        <Link href="/tasks"><span className="workspace-stat-label">Active actions</span><strong>{taskQuery.isLoading ? "—" : activeTasks.length}</strong><small className={overdueTasks.length ? "attention" : ""}>{overdueTasks.length ? `${overdueTasks.length} overdue` : "No overdue actions"}</small><span className="workspace-stat-icon"><ListChecks size={18} /></span></Link>
        <Link href="/calendar"><span className="workspace-stat-label">Upcoming dates</span><strong>{taskQuery.isLoading || lifecycleQuery.isLoading ? "—" : upcomingTasks.length + upcomingNoticeDeadlines.length}</strong><small>{upcomingNoticeDeadlines.length ? `${upcomingNoticeDeadlines.length} notice ${upcomingNoticeDeadlines.length === 1 ? "window" : "windows"}` : "Confirmed task deadlines"}</small><span className="workspace-stat-icon"><CalendarDays size={18} /></span></Link>
      </section>

      <TableCard className="section" title="Decision queue" description="Reviews that need a human next step" actions={<Link className="section-link" href="/inbox">Open inbox <ArrowRight size={13} /></Link>}>
        {query.isLoading ? <PageLoading rows={3} /> : query.error ? <PageError error={query.error} /> : attention.length ? <ContractList contracts={attention} limit={5} /> : <EmptyContracts compact message="No reviews need your attention." />}
      </TableCard>

      <section className="section"><div className="section-heading"><div><h2>{isDemo ? "Assigned actions" : "My actions"}</h2><p>Human-owned work linked to contract evidence</p></div><Link className="section-link" href="/tasks">Open tasks <ArrowRight size={13} /></Link></div>{taskQuery.isLoading ? <PageLoading rows={3} /> : taskQuery.error ? <PageError error={taskQuery.error} /> : <TaskList tasks={myTasks} compact empty="No active tasks." />}</section>

      <section className="section today-grid">
        <TableCard title="Recent contracts" description="Last activity across the workspace" actions={<Link className="section-link" href="/contracts">View all</Link>}>
          {query.isLoading ? <PageLoading rows={4} /> : contracts.length ? <ContractList contracts={contracts} limit={5} /> : <EmptyContracts canCreate={canUpload} />}
        </TableCard>
        <aside>
          <div className="section-heading"><div><h2>Upcoming dates</h2><p>Human-confirmed deadlines</p></div><Link className="section-link" href="/calendar">Calendar</Link></div>
          {upcoming.length ? <div className="upcoming-list panel">{upcoming.map((task) => <Link href="/tasks" key={task.id}><span><CalendarDays size={14} /></span><div><strong>{task.title}</strong><p>{task.contract_title || "Workspace action"}</p></div><time>{new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(task.due_at!))}</time></Link>)}</div> : <div className="dates-empty panel"><span className="dates-day">—</span><h3>No confirmed dates yet</h3><p>Add a due date to an action after a reviewer verifies the deadline.</p></div>}
        </aside>
      </section>
    </div>
  );
}
