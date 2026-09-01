"use client";

import { useQuery } from "@tanstack/react-query";
import { Inbox, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { ContractList } from "@/components/contract-list";
import { EmptyContracts, PageError, PageLoading } from "@/components/page-states";
import { TaskList } from "@/components/task-list";
import { TableCard } from "@/components/ui/table-card";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import { dueAtEndOfDay, isOverdue } from "@/lib/utils";

type InboxScope = "all" | "overdue" | "due_soon" | "decisions" | "processing" | "blocked";

export default function InboxPage() {
  const [now] = useState(() => Date.now());
  const [scope, setScope] = useState<InboxScope>("all");
  const { activeOrganization } = useWorkspace();
  const query = useQuery({ queryKey: ["contracts", activeOrganization?.id], queryFn: () => api.contracts(activeOrganization!.id), enabled: Boolean(activeOrganization), refetchInterval: (state) => state.state.data?.some((item) => ["queued", "processing", "running"].includes(item.status)) ? 5000 : false });
  const taskQuery = useQuery({ queryKey: ["tasks", activeOrganization?.id], queryFn: () => api.tasks(activeOrganization!.id), enabled: Boolean(activeOrganization) });
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
  return <div className="page"><div className="page-heading"><div><h1 className="page-title">Inbox</h1><p className="page-description">Reviews, overdue actions, and processing problems that need attention.</p></div></div>
    <div className="inbox-filters task-tabs" role="tablist" aria-label="Inbox filters">{([
      ["all", "All", overdue.length + dueSoon.length + ready.length + moving.length + blocked.length], ["overdue", "Overdue", overdue.length], ["due_soon", "Due soon", dueSoon.length], ["decisions", "Decisions", ready.length], ["processing", "Processing", moving.length], ["blocked", "Blocked", blocked.length],
    ] as Array<[InboxScope, string, number]>).map(([value, label, count]) => <button type="button" role="tab" aria-selected={scope === value} key={value} onClick={() => setScope(value)}>{label} ({count})</button>)}</div>
    {(query.isLoading || taskQuery.isLoading) ? <PageLoading rows={7} /> : query.error ? <PageError error={query.error} /> : taskQuery.error ? <PageError error={taskQuery.error} /> : (!work.length && !overdue.length && !dueSoon.length) ? <EmptyContracts compact message="No reviews need your attention." /> : <div className="inbox-sections">
      {(scope === "all" || scope === "overdue") && overdue.length > 0 && <section><div className="section-heading"><h2>Overdue actions <span className="count danger-count">{overdue.length}</span></h2><p><TriangleAlert size={15} />Needs a human update</p></div><TaskList tasks={overdue} /></section>}
      {(scope === "all" || scope === "due_soon") && dueSoon.length > 0 && <section><div className="section-heading"><h2>Due in the next 7 days <span className="count">{dueSoon.length}</span></h2></div><TaskList tasks={dueSoon} /></section>}
      {(scope === "all" || scope === "decisions") && <TableCard title="Ready for a decision" description={`${ready.length} ${ready.length === 1 ? "contract" : "contracts"}`}>{ready.length ? <ContractList contracts={ready} showFooter /> : <div className="quiet-empty"><Inbox size={16} />No contract decisions are waiting</div>}</TableCard>}
      {(scope === "all" || scope === "processing") && <TableCard title="Processing" description={`${moving.length} active, updates automatically`}>{moving.length ? <ContractList contracts={moving} showFooter /> : <div className="quiet-empty"><Inbox size={16} />No active processing jobs</div>}</TableCard>}
      {(scope === "all" || scope === "blocked") && blocked.length > 0 && <TableCard title="Blocked" description={`${blocked.length} ${blocked.length === 1 ? "contract" : "contracts"}`}><ContractList contracts={blocked} showFooter /></TableCard>}
      {scope !== "all" && ((scope === "overdue" && !overdue.length) || (scope === "due_soon" && !dueSoon.length) || (scope === "blocked" && !blocked.length)) && <div className="quiet-empty"><Inbox size={16} />No items match this inbox filter</div>}
    </div>}
  </div>;
}
