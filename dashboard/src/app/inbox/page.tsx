"use client";

import { Inbox, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { ContractList } from "@/components/contract-list";
import { EmptyContracts, PageError, PageLoading } from "@/components/page-states";
import { TaskList } from "@/components/task-list";
import { TableCard } from "@/components/ui/table-card";
import { QueryPagination } from "@/components/ui/query-pagination";
import { useWorkspace } from "@/components/workspace-provider";
import { overviewWindow, useContractPage, useTaskPage, useWorkspaceOverview } from "@/lib/workspace-query-hooks";

type InboxScope = "all" | "overdue" | "due_soon" | "decisions" | "processing" | "blocked";

function ContractQueue({ organizationId, status, title, description, empty }: { organizationId: string; status: string; title: string; description: string; empty?: string }) {
  const query = useContractPage(organizationId, { status }, status === "queued,processing,running");
  return <TableCard title={title} description={description}>{query.isLoading ? <PageLoading rows={3} /> : query.error ? <PageError error={query.error} /> : !query.data?.total && empty ? <div className="quiet-empty"><Inbox size={16} />{empty}</div> : <ContractList contracts={query.data?.items ?? []} paging={{ total: query.data?.total ?? 0, offset: query.offset, limit: 25, onOffsetChange: query.setOffset, sort: query.sort, onSortChange: query.setSort }} />}</TableCard>;
}

function TaskQueue({ organizationId, overdue, dayStart, weekEnd, count }: { organizationId: string; overdue?: boolean; dayStart: string; weekEnd: string; count: number }) {
  const query = useTaskPage(organizationId, { status: "open,in_progress", due_before: overdue ? dayStart : weekEnd, due_before_exclusive: true, due_after: overdue ? undefined : dayStart });
  return <section><div className="section-heading"><h2>{overdue ? "Overdue actions" : "Due in the next 7 days"} <span className={`count ${overdue ? "danger-count" : ""}`}>{count}</span></h2>{overdue && <p><TriangleAlert size={15} />Needs a human update</p>}</div>{query.isLoading ? <PageLoading rows={3} /> : query.error ? <PageError error={query.error} /> : <><TaskList tasks={query.data?.items ?? []} table /><QueryPagination total={query.data?.total ?? 0} offset={query.offset} limit={25} onOffsetChange={query.setOffset} label={overdue ? "Overdue actions" : "Due soon actions"} /></>}</section>;
}

export default function InboxPage() {
  const [window] = useState(() => overviewWindow());
  const [scope, setScope] = useState<InboxScope>("all");
  const { activeOrganization } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const overview = useWorkspaceOverview(organizationId);
  const counts = overview.data?.counts;
  const overdue = counts?.overdue_tasks ?? 0, dueSoon = counts?.due_soon_tasks ?? 0;
  const ready = counts?.ready ?? 0, moving = counts?.processing ?? 0, blocked = counts?.failed ?? 0;
  const total = overdue + dueSoon + ready + moving + blocked;
  return <div className="page"><div className="page-heading"><div><h1 className="page-title">Inbox</h1><p className="page-description">Reviews, overdue actions, and processing problems that need attention.</p></div></div>
    <div className="inbox-filters task-tabs" role="tablist" aria-label="Inbox filters">{([
      ["all", "All", total], ["overdue", "Overdue", overdue], ["due_soon", "Due soon", dueSoon], ["decisions", "Decisions", ready], ["processing", "Processing", moving], ["blocked", "Blocked", blocked],
    ] as Array<[InboxScope, string, number]>).map(([value, label, count]) => <button type="button" role="tab" aria-selected={scope === value} key={value} onClick={() => setScope(value)}>{label} ({counts ? count : "—"})</button>)}</div>
    {overview.isLoading ? <PageLoading rows={7} /> : overview.error ? <PageError error={overview.error} /> : !total ? <EmptyContracts compact message="No reviews need your attention." /> : <div className="inbox-sections">
      {(scope === "all" || scope === "overdue") && overdue > 0 && <TaskQueue key={`${organizationId}-overdue`} organizationId={organizationId} overdue dayStart={window.day_start} weekEnd={window.week_end} count={overdue} />}
      {(scope === "all" || scope === "due_soon") && dueSoon > 0 && <TaskQueue key={`${organizationId}-soon`} organizationId={organizationId} dayStart={window.day_start} weekEnd={window.week_end} count={dueSoon} />}
      {(scope === "all" || scope === "decisions") && <ContractQueue key={`${organizationId}-ready`} organizationId={organizationId} status="ready" title="Ready for a decision" description={`${ready} ${ready === 1 ? "contract" : "contracts"}`} empty="No contract decisions are waiting" />}
      {(scope === "all" || scope === "processing") && <ContractQueue key={`${organizationId}-processing`} organizationId={organizationId} status="queued,processing,running" title="Processing" description={`${moving} active, updates automatically`} empty="No active processing jobs" />}
      {(scope === "all" || scope === "blocked") && blocked > 0 && <ContractQueue key={`${organizationId}-failed`} organizationId={organizationId} status="failed" title="Blocked" description={`${blocked} ${blocked === 1 ? "contract" : "contracts"}`} />}
      {scope !== "all" && ((scope === "overdue" && !overdue) || (scope === "due_soon" && !dueSoon) || (scope === "blocked" && !blocked)) && <div className="quiet-empty"><Inbox size={16} />No items match this inbox filter</div>}
    </div>}
  </div>;
}
