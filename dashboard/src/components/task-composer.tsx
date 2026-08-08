"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ClipboardPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import type { TaskCategory, TaskCreate, TaskPriority, WorkflowTask } from "@/lib/types";
import { AppSelect } from "./app-select";
import { useWorkspace } from "./workspace-provider";

type TaskComposerProps = {
  contractId?: string;
  title?: string;
  description?: string;
  category?: TaskCategory;
  sourceKind?: string;
  sourceReference?: Record<string, unknown>;
  onCreated?: (task: WorkflowTask) => void;
};

export function TaskComposer({
  contractId = "",
  title = "",
  description = "",
  category = "follow_up",
  sourceKind = "manual",
  sourceReference = {},
  onCreated,
}: TaskComposerProps) {
  const { activeOrganization, user, canUpload } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<WorkflowTask | null>(null);
  const members = useQuery({ queryKey: ["members", organizationId], queryFn: () => api.members(organizationId), enabled: Boolean(organizationId) });
  const contracts = useQuery({ queryKey: ["contracts", organizationId], queryFn: () => api.contracts(organizationId), enabled: Boolean(organizationId) });
  const mutation = useMutation({
    mutationFn: (payload: TaskCreate) => api.createTask(organizationId, payload),
    onSuccess: async (task) => {
      setCreated(task);
      await queryClient.invalidateQueries({ queryKey: ["tasks", organizationId] });
      onCreated?.(task);
    },
  });

  if (!canUpload) return <div className="task-composer-readonly"><p>Viewers can inspect tasks but cannot create or change them.</p></div>;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreated(null);
    const form = new FormData(event.currentTarget);
    const dueDate = String(form.get("due_at") ?? "");
    mutation.mutate({
      title: String(form.get("title") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      contract_id: String(form.get("contract_id") ?? "") || null,
      assigned_to_user_id: String(form.get("assigned_to_user_id") ?? "") || null,
      category: String(form.get("category") ?? "follow_up") as TaskCategory,
      priority: String(form.get("priority") ?? "normal") as TaskPriority,
      due_at: dueDate ? new Date(`${dueDate}T09:00:00`).toISOString() : null,
      source_kind: sourceKind,
      source_reference: sourceReference,
    });
  }

  return <form className="task-composer" onSubmit={submit}>
    <div className="task-composer-heading"><span><ClipboardPlus size={18} /></span><div><h2>Create an action</h2><p>Assign a clear human next step. Lenslayer will not create or complete tasks automatically.</p></div></div>
    <div className="task-form-grid">
      <div className="field task-title-field"><label htmlFor="task-title">Task</label><input className="input" id="task-title" name="title" defaultValue={title} placeholder="e.g. Confirm the renewal notice window" minLength={2} maxLength={512} required autoFocus={Boolean(title)} /></div>
      <div className="field"><label htmlFor="task-due">Due date</label><input className="input" id="task-due" name="due_at" type="date" /></div>
      <div className="field"><label htmlFor="task-assignee">Assignee</label><AppSelect id="task-assignee" name="assigned_to_user_id" defaultValue={user?.id ?? ""} options={[{ value: "", label: "Unassigned" }, ...(members.data ?? []).map((member) => ({ value: member.user_id, label: member.display_name || member.email }))]} /></div>
      <div className="field"><label htmlFor="task-contract">Contract</label><AppSelect id="task-contract" name="contract_id" defaultValue={contractId} options={[{ value: "", label: "No contract" }, ...(contracts.data ?? []).map((contract) => ({ value: contract.id, label: contract.title || contract.source_name }))]} /></div>
      <div className="field"><label htmlFor="task-category">Type</label><AppSelect id="task-category" name="category" defaultValue={category} options={[{ value: "follow_up", label: "Follow-up" }, { value: "risk", label: "Risk response" }, { value: "obligation", label: "Obligation" }, { value: "deadline", label: "Deadline" }, { value: "negotiation", label: "Negotiation" }, { value: "professional_review", label: "Professional review" }]} /></div>
      <div className="field"><label htmlFor="task-priority">Priority</label><AppSelect id="task-priority" name="priority" defaultValue="normal" options={[{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }]} /></div>
      <div className="field task-description-field"><label htmlFor="task-description">Context <span>Optional</span></label><textarea className="textarea" id="task-description" name="description" defaultValue={description} placeholder="What should the assignee verify, decide, or deliver?" maxLength={4000} /></div>
    </div>
    <div className="task-composer-actions"><button className="button" type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Creating action…" : "Create action"}<ArrowRight size={16} /></button>{created && <p className="task-created"><Check size={15} />Action created for {created.assigned_to_name || "the workspace"}.</p>}{mutation.error && <p className="form-error" role="alert">{mutation.error.message}</p>}</div>
  </form>;
}
