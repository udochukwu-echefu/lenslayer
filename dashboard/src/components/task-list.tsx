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
import { StatusBadge } from "./ui/status-badge";

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

export function TaskList({ tasks, empty = "No actions match this view.", compact = false, table = false }: { tasks: WorkflowTask[]; empty?: string; compact?: boolean; table?: boolean }) {
  const { activeOrganization, canUpload } = useWorkspace();
  const [now] = useState(() => Date.now());
  const organizationId = activeOrganization?.id ?? "";
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => api.updateTask(organizationId, id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", organizationId] }),
  });

  if (!tasks.length) return <div className="task-empty"><Circle size={16} /><p>{empty}</p></div>;

  const taskCheck = (task: WorkflowTask) => <span className="permission-control" title={!canUpload ? "Only owners, administrators, and reviewers can change task status." : undefined}><button type="button" className="task-check" aria-label={!canUpload ? `${task.title} status is read only` : task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`} disabled={!canUpload || mutation.isPending} onClick={() => mutation.mutate({ id: task.id, status: task.status === "done" ? "open" : "done" })}>{task.status === "done" ? <Check size={15} /> : <Circle size={15} />}</button></span>;
  const taskStatus = (task: WorkflowTask) => canUpload ? <AppSelect className="task-status-select" ariaLabel={`Status for ${task.title}`} value={task.status} disabled={mutation.isPending} onValueChange={(status) => mutation.mutate({ id: task.id, status: status as TaskStatus })} options={[{ value: "open", label: "Open" }, { value: "in_progress", label: "In progress" }, { value: "done", label: "Done" }, { value: "cancelled", label: "Cancelled" }]} /> : <StatusBadge status={task.status} className="task-status-label" />;

  if (compact || table) return <div className={`task-list assigned-actions${compact ? " compact" : ""}`}>
    <div className="assigned-actions-table-wrap">
      <table className="assigned-actions-table">
        <colgroup><col className="assigned-actions-check-col" /><col /><col className="assigned-actions-owner-col" /><col className="assigned-actions-priority-col" /><col className="assigned-actions-status-col" /><col className="assigned-actions-due-col" /></colgroup>
        <thead><tr><th scope="col"><span className="sr-only">Complete</span></th><th scope="col">Task</th><th scope="col">Owner</th><th scope="col">Priority</th><th scope="col">Status</th><th scope="col">Due</th></tr></thead>
        <tbody>{tasks.map((task) => {
          const due = dueState(task, now);
          return <tr className={task.status === "done" ? "is-done" : ""} key={task.id}>
            <td className="assigned-action-check">{taskCheck(task)}</td>
            <td className="assigned-action-primary"><strong>{task.title}</strong>{task.contract_id ? <Link href={`/contracts/${task.contract_id}`}><FileText size={13} />{task.contract_title}</Link> : <span>Workspace action</span>}</td>
            <td className="assigned-action-owner"><span><UserRound size={13} />{task.assigned_to_name || "Unassigned"}</span></td>
            <td className="assigned-action-priority"><span className={`task-priority ${task.priority}`}>{titleCase(task.priority)}</span></td>
            <td className="assigned-action-status">{taskStatus(task)}</td>
            <td className="assigned-action-due"><time className={`task-due ${due}`} dateTime={task.due_at ?? undefined}>{task.due_at ? <><CalendarDays size={13} />{due === "overdue" ? "Overdue · " : due === "today" ? "Today · " : ""}{formatDate(task.due_at, { day: "numeric", month: "short" })}</> : <><Clock3 size={13} />No due date</>}</time></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {mutation.error && <p className="form-error task-list-error">{mutation.error.message}</p>}
  </div>;

  return <div className="task-list">{tasks.map((task) => {
    const due = dueState(task, now);
    return <article className={`task-row ${task.status === "done" ? "is-done" : ""}`} key={task.id}>
      {taskCheck(task)}
      <div className="task-primary"><strong>{task.title}</strong><div className="task-meta">{task.contract_id ? <Link href={`/contracts/${task.contract_id}`}><FileText size={12} />{task.contract_title}</Link> : <span>Workspace action</span>}<span><UserRound size={12} />{task.assigned_to_name || "Unassigned"}</span></div></div>
      <div className="task-details">
        <span className={`task-priority ${task.priority}`}>{titleCase(task.priority)}</span>
        {taskStatus(task)}
        <time className={`task-due ${due}`} dateTime={task.due_at ?? undefined}>{task.due_at ? <><CalendarDays size={13} />{due === "overdue" ? "Overdue · " : due === "today" ? "Today · " : ""}{formatDate(task.due_at, { day: "numeric", month: "short" })}</> : <><Clock3 size={13} />No due date</>}</time>
      </div>
    </article>;
  })}{mutation.error && <p className="form-error task-list-error">{mutation.error.message}</p>}</div>;
}
