import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FormScreen } from "@/components/form-screen";
import { AppText, DateField, Notice, Segmented, Select, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { titleCase } from "@/lib/format";
import { invalidateWorkspaceRecords, useMembers } from "@/lib/queries";
import type { TaskCategory, TaskPriority } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";

const categories: TaskCategory[] = ["follow_up", "risk", "obligation", "deadline", "negotiation", "professional_review"];

/**
 * A new action. Opened plain from the Tasks view, or pre-filled from a finding,
 * obligation or date ("Create follow-up"), in which case the source is saved
 * with the task so anyone can trace it back to the clause.
 */
export default function NewTaskScreen() {
  const params = useLocalSearchParams<{ contractId?: string; category?: string; sourceKind?: string; sourceIndex?: string; title?: string; description?: string }>();
  const { organizationId, user } = useWorkspace();
  const queryClient = useQueryClient();
  const members = useMembers(organizationId);
  const [title, setTitle] = useState(params.title ?? "");
  const [description, setDescription] = useState(params.description ?? "");
  const [assignee, setAssignee] = useState(user?.id ?? "");
  const [due, setDue] = useState<Date | null>(null);
  const [priority, setPriority] = useState<TaskPriority>(params.category === "risk" ? "high" : "normal");
  const [category, setCategory] = useState<TaskCategory>(categories.includes(params.category as TaskCategory) ? (params.category as TaskCategory) : "follow_up");

  const create = useMutation({
    mutationFn: () => api.createTask(organizationId, {
      title: title.trim(),
      description: description.trim(),
      contract_id: params.contractId || null,
      assigned_to_user_id: assignee || null,
      category,
      priority,
      due_at: due ? due.toISOString() : null,
      ...(params.sourceKind ? { source_kind: params.sourceKind, source_reference: { index: Number(params.sourceIndex ?? 0) } } : {}),
    }),
    onSuccess: async () => { await invalidateWorkspaceRecords(queryClient, organizationId, "tasks"); router.back(); },
  });

  return (
    <FormScreen submitLabel="Create" onSubmit={() => create.mutate()} disabled={title.trim().length < 2} loading={create.isPending} error={create.error}
      footnote="LensLayer never creates or completes actions on its own. A person owns every step.">
      {params.sourceKind ? <Notice icon="quote" title={`From ${titleCase(params.sourceKind)} ${String(Number(params.sourceIndex ?? 0) + 1).padStart(2, "0")}`} message="The source stays linked to this action." /> : null}
      <TextField label="Action" value={title} onChangeText={setTitle} maxLength={255} placeholder="What needs to happen" autoFocus={!params.title} />
      <TextField label="Context (optional)" value={description} onChangeText={setDescription} multiline maxLength={4000} />
      <Select label="Assign to" value={assignee} onChange={setAssignee}
        options={[{ value: "", label: "Unassigned" }, ...(members.data ?? []).map((member) => ({ value: member.user_id, label: member.display_name || member.email, description: titleCase(member.role) }))]} />
      <DateField label="Due" value={due} onChange={setDue} optional />
      <Select label="Type" value={category} onChange={setCategory} options={categories.map((value) => ({ value, label: titleCase(value) }))} />
      <AppText variant="smallStrong" tone="muted">Priority</AppText>
      <Segmented label="Priority" value={priority} onChange={setPriority} options={[{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }]} />
    </FormScreen>
  );
}
