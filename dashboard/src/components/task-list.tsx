"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, Circle, Clock3, FileText, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import type { TaskStatus, WorkflowTask } from "@/lib/types";
import { dueAtEndOfDay, formatDate, titleCase } from "@/lib/utils";
import { AppSelect } from "./app-select";
import { useWorkspace } from "./workspace-provider";

function dueState(task: WorkflowTask, now: number) {
  if (!task.due_at || ["done", "cancelled"].includes(task.status)) return "";
  const due = dueAtEndOfDay(task.due_at);
  if (due === null) return "";
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (due < now) return "overdue";
  if (due <= endOfToday.getTime()) return "today";
  return "";
}

export function TaskList({ tasks, empty = "No actions match this view.", compact = false }: { tasks: WorkflowTask[]; empty?: string; compact?: boolean }) {
  const { activeOrganization, canUpload } = useWorkspace();
  const [now] = useState(() => Date.now());
  const organizationId = activeOrganization?.id ?? "";
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => api.updateTask(organizationId, id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", organizationId] }),
  });

  if (!tasks.length) return <div className="task-empty"><Circle size={16} /><p>{empty}</p></div>;

  return <div className={`task-list ${compact ? "compact" : ""}`}>{tasks.map((task) => {
    const due = dueState(task, now);
    return <article className={`task-row ${task.status === "done" ? "is-done" : ""}`} key={task.id}>
      <button type="button" className="task-check" aria-label={task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`} disabled={!canUpload || mutation.isPending} onClick={() => mutation.mutate({ id: task.id, status: task.status === "done" ? "open" : "done" })}>{task.status === "done" ? <Check size={15} /> : <Circle size={15} />}</button>
      <div className="task-primary"><strong>{task.title}</strong><div className="task-meta">{task.contract_id ? <Link href={`/contracts/${task.contract_id}`}><FileText size={12} />{task.contract_title}</Link> : <span>Workspace action</span>}<span><UserRound size={12} />{task.assigned_to_name || "Unassigned"}</span></div></div>
      <span className={`task-priority ${task.priority}`}>{titleCase(task.priority)}</span>
      {canUpload ? <AppSelect className="task-status-select" ariaLabel={`Status for ${task.title}`} value={task.status} disabled={mutation.isPending} onValueChange={(status) => mutation.mutate({ id: task.id, status: status as TaskStatus })} options={[{ value: "open", label: "Open" }, { value: "in_progress", label: "In progress" }, { value: "done", label: "Done" }, { value: "cancelled", label: "Cancelled" }]} /> : <span className="task-status-label">{titleCase(task.status)}</span>}
      <time className={`task-due ${due}`} dateTime={task.due_at ?? undefined}>{task.due_at ? <><CalendarDays size={13} />{due === "overdue" ? "Overdue · " : due === "today" ? "Today · " : ""}{formatDate(task.due_at, { day: "numeric", month: "short" })}</> : <><Clock3 size={13} />No due date</>}</time>
    </article>;
  })}{mutation.error && <p className="form-error task-list-error">{mutation.error.message}</p>}</div>;
}
