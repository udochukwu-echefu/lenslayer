"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, TriangleAlert, X } from "lucide-react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageError, PageLoading } from "@/components/page-states";
import { TaskComposer } from "@/components/task-composer";
import { TaskList } from "@/components/task-list";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import type { TaskCategory, WorkflowTask } from "@/lib/types";
import { isOverdue } from "@/lib/utils";

type Scope = "active" | "mine" | "done" | "all";

function TasksContent() {
  const search = useSearchParams();
  const { activeOrganization, user, canUpload } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const requestedComposer = search.get("new") === "1";
  const [composerOpen, setComposerOpen] = useState(requestedComposer);
  const [scope, setScope] = useState<Scope>("active");
  const [now] = useState(() => Date.now());
  const query = useQuery({ queryKey: ["tasks", organizationId], queryFn: () => api.tasks(organizationId), enabled: Boolean(organizationId) });
  const tasks = query.data ?? [];
  const active = tasks.filter((task) => ["open", "in_progress"].includes(task.status));
  const overdue = active.filter((task) => isOverdue(task.due_at, now));
  const completed = tasks.filter((task) => task.status === "done");
  const visible: WorkflowTask[] = scope === "active" ? active : scope === "mine" ? active.filter((task) => task.assigned_to_user_id === user?.id) : scope === "done" ? completed : tasks;
  const sourceReference = search.get("sourceIndex") ? { finding_index: Number(search.get("sourceIndex")), source: "contract_review" } : {};

  return <div className="page tasks-page">
    <div className="page-heading"><div><h1 className="page-title">Tasks</h1><p className="page-description">Assigned work created from contract findings, deadlines, and negotiation decisions.</p></div>{canUpload && <button className={`button ${composerOpen ? "secondary" : ""}`} type="button" onClick={() => setComposerOpen((value) => !value)}>{composerOpen ? <X size={16} /> : <Plus size={16} />}{composerOpen ? "Close composer" : "New task"}</button>}</div>

    {composerOpen && <section className="task-composer-wrap panel"><TaskComposer contractId={search.get("contractId") ?? ""} title={search.get("title") ?? ""} description={search.get("description") ?? ""} category={(search.get("category") as TaskCategory | null) ?? "follow_up"} sourceKind={search.get("sourceKind") ?? "manual"} sourceReference={sourceReference} onCreated={() => setComposerOpen(false)} /></section>}

    {overdue.length > 0 && <a className="task-attention" href="#task-register"><TriangleAlert size={16} /><strong>{overdue.length} overdue action{overdue.length === 1 ? "" : "s"}</strong><span>Review due dates and ownership</span></a>}

    <section id="task-register" className="tasks-register"><div className="task-tabs" role="tablist" aria-label="Task views">{(["active", "mine", "done", "all"] as Scope[]).map((item) => <button key={item} type="button" role="tab" aria-selected={scope === item} onClick={() => setScope(item)}>{item === "mine" ? "Assigned to me" : item === "done" ? `Completed (${completed.length})` : item === "active" ? `Active (${active.length})` : item[0].toUpperCase() + item.slice(1)}</button>)}</div>{query.isLoading ? <PageLoading rows={7} /> : query.error ? <PageError error={query.error} /> : <TaskList tasks={visible} table empty={scope === "active" ? "No active tasks. Create one from a contract finding or deadline." : "No tasks match this view."} />}</section>
  </div>;
}

export default function TasksPage() {
  return <Suspense fallback={<div className="page"><PageLoading rows={7} /></div>}><TasksContent /></Suspense>;
}
