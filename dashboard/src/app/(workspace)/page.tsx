"use client";

import { ArrowRight, CalendarDays, CircleCheckBig, Files, ListChecks, Upload } from "lucide-react";
import Link from "next/link";
import { ContractList } from "@/components/contract-list";
import { EmptyContracts, PageError, PageLoading } from "@/components/page-states";
import { TaskList } from "@/components/task-list";
import { TableCard } from "@/components/ui/table-card";
import { useWorkspace } from "@/components/workspace-provider";
import { useWorkspaceOverview } from "@/lib/workspace-query-hooks";

export default function TodayPage() {
  const { activeOrganization, canUpload, isDemo } = useWorkspace();
  const query = useWorkspaceOverview(activeOrganization?.id ?? "");
  const counts = query.data?.counts;
  const contracts = query.data?.recent_contracts ?? [];
  const attention = query.data?.attention_contracts ?? [];
  const myTasks = query.data?.my_tasks ?? [];
  const upcoming = query.data?.upcoming_tasks ?? [];

  return (
    <div className="page today-page">
      <div className="page-heading">
        <div><h1 className="page-title">Workspace overview</h1><p className="page-description">Reviews, processing issues, and verified dates that need a human next step.</p></div>
        {canUpload && <Link href="/contracts/new" className="button"><Upload size={16} />Upload contract</Link>}
      </div>

      <section className="workspace-stats" aria-label="Workspace statistics">
        <Link href="/contracts"><span className="workspace-stat-label">Contracts</span><strong>{counts?.contracts ?? "—"}</strong><small>{counts?.failed ? `${counts.failed} processing ${counts.failed === 1 ? "failure" : "failures"}` : "Across this workspace"}</small><span className="workspace-stat-icon"><Files size={18} /></span></Link>
        <Link href="/inbox"><span className="workspace-stat-label">Ready for decision</span><strong>{counts?.ready ?? "—"}</strong><small>{counts?.ready ? "Human review required" : "Decision queue is clear"}</small><span className="workspace-stat-icon"><CircleCheckBig size={18} /></span></Link>
        <Link href="/tasks"><span className="workspace-stat-label">Active actions</span><strong>{counts?.active_tasks ?? "—"}</strong><small className={counts?.overdue_tasks ? "attention" : ""}>{counts?.overdue_tasks ? `${counts.overdue_tasks} overdue` : "No overdue actions"}</small><span className="workspace-stat-icon"><ListChecks size={18} /></span></Link>
        <Link href="/calendar"><span className="workspace-stat-label">Upcoming dates</span><strong>{counts ? counts.upcoming_tasks + counts.upcoming_notice_deadlines : "—"}</strong><small>{counts?.upcoming_notice_deadlines ? `${counts.upcoming_notice_deadlines} notice ${counts.upcoming_notice_deadlines === 1 ? "window" : "windows"}` : "Confirmed task deadlines"}</small><span className="workspace-stat-icon"><CalendarDays size={18} /></span></Link>
      </section>

      <TableCard className="section" title="Decision queue" description="Reviews that need a human next step" actions={<Link className="section-link" href="/inbox">Open inbox <ArrowRight size={13} /></Link>}>
        {query.isLoading ? <PageLoading rows={3} /> : query.error ? <PageError error={query.error} /> : attention.length ? <ContractList contracts={attention} limit={5} /> : <EmptyContracts compact message="No reviews need your attention." />}
      </TableCard>

      <section className="section"><div className="section-heading"><div><h2>{isDemo ? "Assigned actions" : "My actions"}</h2><p>Human-owned work linked to contract evidence</p></div><Link className="section-link" href="/tasks">Open tasks <ArrowRight size={13} /></Link></div>{query.isLoading ? <PageLoading rows={3} /> : query.error ? <PageError error={query.error} /> : <TaskList tasks={myTasks} compact empty="No active tasks." />}</section>

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
