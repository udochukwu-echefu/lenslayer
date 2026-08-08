"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Clock3, Plus, TriangleAlert, X } from "lucide-react";
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
    <div className="page-heading"><div><p className="eyebrow">Contract operations</p><h1 className="page-title">Tasks</h1><p className="page-description">Turn findings into owned work, keep deadlines visible, and record when the human next step is complete.</p></div>{canUpload && <button className={`button ${composerOpen ? "secondary" : ""}`} type="button" onClick={() => setComposerOpen((value) => !value)}>{composerOpen ? <X size={16} /> : <Plus size={16} />}{composerOpen ? "Close composer" : "New task"}</button>}</div>

    {composerOpen && <section className="task-composer-wrap panel"><TaskComposer contractId={search.get("contractId") ?? ""} title={search.get("title") ?? ""} description={search.get("description") ?? ""} category={(search.get("category") as TaskCategory | null) ?? "follow_up"} sourceKind={search.get("sourceKind") ?? "manual"} sourceReference={sourceReference} onCreated={() => setComposerOpen(false)} /></section>}

    <div className="task-signal-strip" aria-label="Task status"><div><ClipboardList size={17} /><strong>{active.length}</strong><span>Active</span></div><div className={overdue.length ? "attention" : ""}><TriangleAlert size={17} /><strong>{overdue.length}</strong><span>Overdue</span></div><div><CheckCircle2 size={17} /><strong>{completed.length}</strong><span>Completed</span></div></div>

    <section className="tasks-register"><div className="task-tabs" role="tablist" aria-label="Task views">{(["active", "mine", "done", "all"] as Scope[]).map((item) => <button key={item} type="button" role="tab" aria-selected={scope === item} onClick={() => setScope(item)}>{item === "mine" ? "Assigned to me" : item === "done" ? "Completed" : item[0].toUpperCase() + item.slice(1)}</button>)}</div>{query.isLoading ? <PageLoading rows={7} /> : query.error ? <PageError error={query.error} /> : <TaskList tasks={visible} empty={scope === "active" ? "No active actions. Create one when a contract needs a human next step." : "No actions match this view."} />}</section>

    {!query.isLoading && active.length > 0 && <p className="task-register-note"><Clock3 size={14} />Only people complete tasks. Lenslayer surfaces evidence and due dates but never closes work automatically.</p>}
  </div>;
}

export default function TasksPage() {
  return <Suspense fallback={<div className="page"><PageLoading rows={7} /></div>}><TasksContent /></Suspense>;
}
