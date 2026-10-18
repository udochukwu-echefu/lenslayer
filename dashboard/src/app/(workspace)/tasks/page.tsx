"use client";

import { Plus, TriangleAlert, X } from "lucide-react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageError, PageLoading } from "@/components/page-states";
import { TaskComposer } from "@/components/task-composer";
import { TaskList } from "@/components/task-list";
import { useWorkspace } from "@/components/workspace-provider";
import type { TaskCategory } from "@/lib/types";
import { useDebouncedValue, useTaskPage, useWorkspaceOverview } from "@/lib/workspace-query-hooks";
import { QueryPagination } from "@/components/ui/query-pagination";
import { AppSelect } from "@/components/app-select";
import type { TaskFilters } from "@/lib/api/workspace-queries";

type Scope = "active" | "mine" | "done" | "all";

function TasksContent() {
  const search = useSearchParams();
  const { activeOrganization, user, canUpload } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const requestedComposer = search.get("new") === "1";
  const [composerOpen, setComposerOpen] = useState(requestedComposer);
  const [scope, setScope] = useState<Scope>("active");
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<NonNullable<TaskFilters["sort"]>>("due_at");
  const [descending, setDescending] = useState(false);
  const q = useDebouncedValue(term.trim());
  const query = useTaskPage(organizationId, { q, status: scope === "all" ? undefined : scope === "done" ? "done" : "open,in_progress", assigned_to_user_id: scope === "mine" ? user?.id : undefined, sort, descending });
  const overview = useWorkspaceOverview(organizationId);
  const visible = query.data?.items ?? [];
  const overdue = overview.data?.counts.overdue_tasks ?? 0;
  const completed = overview.data?.counts.completed_tasks;
  const active = overview.data?.counts.active_tasks;
  const sourceReference = search.get("sourceIndex") ? { finding_index: Number(search.get("sourceIndex")), source: "contract_review" } : {};

  return <div className="page tasks-page">
    <div className="page-heading"><div><h1 className="page-title">Tasks</h1><p className="page-description">Assigned work created from contract findings, deadlines, and negotiation decisions.</p></div>{canUpload && <button className={`button ${composerOpen ? "secondary" : ""}`} type="button" onClick={() => setComposerOpen((value) => !value)}>{composerOpen ? <X size={16} /> : <Plus size={16} />}{composerOpen ? "Close composer" : "New task"}</button>}</div>

    {composerOpen && <section className="task-composer-wrap panel"><TaskComposer contractId={search.get("contractId") ?? ""} title={search.get("title") ?? ""} description={search.get("description") ?? ""} category={(search.get("category") as TaskCategory | null) ?? "follow_up"} sourceKind={search.get("sourceKind") ?? "manual"} sourceReference={sourceReference} onCreated={() => setComposerOpen(false)} /></section>}

    {overdue > 0 && <a className="task-attention" href="#task-register"><TriangleAlert size={16} /><strong>{overdue} overdue action{overdue === 1 ? "" : "s"}</strong><span>Review due dates and ownership</span></a>}

    <section id="task-register" className="tasks-register"><div className="task-tabs" role="tablist" aria-label="Task views">{(["active", "mine", "done", "all"] as Scope[]).map((item) => <button key={item} type="button" role="tab" aria-selected={scope === item} onClick={() => setScope(item)}>{item === "mine" ? "Assigned to me" : item === "done" ? `Completed (${completed ?? "—"})` : item === "active" ? `Active (${active ?? "—"})` : item[0].toUpperCase() + item.slice(1)}</button>)}</div><div className="table-tools"><input className="input" aria-label="Search tasks" placeholder="Search tasks" value={term} maxLength={200} onChange={(event) => setTerm(event.target.value)} /><AppSelect ariaLabel="Sort tasks" value={sort} onValueChange={(value) => setSort(value as typeof sort)} options={[{ value: "due_at", label: "Due" }, { value: "created_at", label: "Created" }, { value: "title", label: "Task" }, { value: "status", label: "Status" }, { value: "priority", label: "Priority" }]} /><button type="button" className="button secondary" onClick={() => setDescending((value) => !value)}>{descending ? "Descending" : "Ascending"}</button></div>{query.isLoading ? <PageLoading rows={7} /> : query.error ? <PageError error={query.error} /> : <><TaskList tasks={visible} table empty={scope === "active" ? "No active tasks. Create one from a contract finding or deadline." : "No tasks match this view."} /><QueryPagination total={query.data?.total ?? 0} offset={query.offset} limit={25} onOffsetChange={query.setOffset} label="Tasks" /></>}</section>
  </div>;
}

export default function TasksPage() {
  return <Suspense fallback={<div className="page"><PageLoading rows={7} /></div>}><TasksContent /></Suspense>;
}
