"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, FileWarning, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ContractList } from "@/components/contract-list";
import { EmptyContracts, PageError, PageLoading } from "@/components/page-states";
import { TaskList } from "@/components/task-list";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import type { Contract } from "@/lib/types";
import { dueAtEndOfDay } from "@/lib/utils";

function needsAttention(contract: Contract) { return ["failed", "ready"].includes(contract.status); }

export default function TodayPage() {
  const [now] = useState(() => Date.now());
  const { activeOrganization, user, canUpload } = useWorkspace();
  const query = useQuery({ queryKey: ["contracts", activeOrganization?.id], queryFn: () => api.contracts(activeOrganization!.id), enabled: Boolean(activeOrganization) });
  const taskQuery = useQuery({ queryKey: ["tasks", activeOrganization?.id], queryFn: () => api.tasks(activeOrganization!.id), enabled: Boolean(activeOrganization) });
  const contracts = query.data ?? [];
  const attention = contracts.filter(needsAttention);
  const processing = contracts.filter((contract) => ["queued", "processing", "running"].includes(contract.status));
  const completed = contracts.filter((contract) => contract.status === "ready");
  const activeTasks = (taskQuery.data ?? []).filter((task) => ["open", "in_progress"].includes(task.status));
  const myTasks = activeTasks.filter((task) => task.assigned_to_user_id === user?.id).slice(0, 5);
  const upcoming = activeTasks.filter((task) => {
    const due = dueAtEndOfDay(task.due_at);
    return due !== null && due >= now;
  }).sort((a,b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()).slice(0, 4);

  return (
    <div className="page today-page">
      <div className="page-heading">
        <div><p className="eyebrow">Today · {activeOrganization?.name}</p><h1 className="page-title">Welcome back, {user?.display_name?.split(" ")[0] ?? "reviewer"}.</h1><p className="page-description">A focused view of reviews that are moving, blocked, or ready for your decision.</p></div>
        {canUpload && <Link href="/contracts/new" className="button"><Upload size={16} />Upload contract</Link>}
      </div>

      <div className="signal-strip" aria-label="Workspace status">
        <div><Clock3 size={17} /><strong>{processing.length}</strong><span>In review</span></div>
        <div><FileWarning size={17} /><strong>{contracts.filter((item) => item.status === "failed").length}</strong><span>Blocked</span></div>
        <div><CheckCircle2 size={17} /><strong>{completed.length}</strong><span>Ready to inspect</span></div>
      </div>

      <section className="section">
        <div className="section-heading"><div><h2>Decision queue</h2><p>Reviews that need a human next step</p></div><Link className="section-link" href="/inbox">Open inbox <ArrowRight size={13} /></Link></div>
        {query.isLoading ? <PageLoading rows={3} /> : query.error ? <PageError error={query.error} /> : attention.length ? <ContractList contracts={attention} limit={5} /> : <EmptyContracts compact />}
      </section>

      <section className="section"><div className="section-heading"><div><h2>My actions</h2><p>Assigned work that still needs a person</p></div><Link className="section-link" href="/tasks">Open tasks <ArrowRight size={13} /></Link></div>{taskQuery.isLoading ? <PageLoading rows={3} /> : taskQuery.error ? <PageError error={taskQuery.error} /> : <TaskList tasks={myTasks} compact empty="Nothing is assigned to you right now." />}</section>

      <section className="section today-grid">
        <div>
          <div className="section-heading"><div><h2>Recent contracts</h2><p>Last activity across the workspace</p></div><Link className="section-link" href="/contracts">View all</Link></div>
          {query.isLoading ? <PageLoading rows={4} /> : contracts.length ? <ContractList contracts={contracts} limit={5} /> : <EmptyContracts canCreate={canUpload} />}
        </div>
        <aside>
          <div className="section-heading"><div><h2>Upcoming dates</h2><p>Human-confirmed deadlines</p></div><Link className="section-link" href="/calendar">Calendar</Link></div>
          {upcoming.length ? <div className="upcoming-list panel">{upcoming.map((task) => <Link href="/tasks" key={task.id}><span><CalendarDays size={14} /></span><div><strong>{task.title}</strong><p>{task.contract_title || "Workspace action"}</p></div><time>{new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(task.due_at!))}</time></Link>)}</div> : <div className="dates-empty panel"><span className="dates-day">—</span><h3>No confirmed dates yet</h3><p>Add a due date to an action after a reviewer verifies the deadline.</p></div>}
        </aside>
      </section>
    </div>
  );
}
