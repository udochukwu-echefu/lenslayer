import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { api } from "@/lib/api";
import { asText, formatDate, titleCase } from "@/lib/format";
import { invalidateWorkspaceRecords, useMembers } from "@/lib/queries";
import type { TaskCategory, TaskPriority, TaskStatus, TaskUpdate, WorkflowTask } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";
import { SourceQuote } from "./evidence";
import { AppText, Button, DateField, Facts, FormError, Section, Select, Sheet } from "./ui";

const STATUS: TaskStatus[] = ["open", "in_progress", "done", "cancelled"];
const PRIORITY: TaskPriority[] = ["low", "normal", "high"];
const CATEGORY: TaskCategory[] = ["follow_up", "risk", "obligation", "deadline", "negotiation", "professional_review"];
const options = <T extends string,>(values: T[]) => values.map((value) => ({ value, label: titleCase(value) }));

/** Opens an action from any register, keeping its linked agreement in view. */
export function TaskDetail({ task, onClose }: { task: WorkflowTask; onClose: () => void }) {
  const { canUpload } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const reference = task.source_reference;
  const location = asText(reference.location ?? reference.citation ?? reference.section, "");
  const excerpt = asText(reference.excerpt ?? reference.quote, "");
  const sourceTab = task.source_kind === "finding" ? "risks"
    : ["obligation", "payment", "deadline"].includes(task.source_kind) ? "obligations"
    : task.source_kind === "negotiation" ? "negotiate" : "overview";

  return (
    <Sheet title={task.title} visible onClose={onClose} action={{ label: "Done", onPress: onClose }}>
      {editing && canUpload ? <TaskFields task={task} onSaved={onClose} /> : (
        <>
          <Facts items={[
            ["Owner", task.assigned_to_name || task.assigned_to_email || "Unassigned"],
            ["Due", task.due_at ? formatDate(task.due_at) : "No due date"],
            ["Status", titleCase(task.status)],
            ["Priority", titleCase(task.priority)],
            ["Type", titleCase(task.category)],
          ]} />
          {task.description ? <Section title="Details"><AppText>{task.description}</AppText></Section> : null}
          {excerpt ? <SourceQuote text={excerpt} location={location || undefined} /> : location ? <AppText variant="small" tone="muted">Source: {location}</AppText> : null}
          {task.contract_id ? <Button label={task.contract_title || "Open agreement"} variant="secondary" icon="contracts" onPress={() => {
            const id = task.contract_id;
            if (id) {
              onClose();
              router.push({ pathname: "/contract/[id]", params: { id, tab: sourceTab } });
            }
          }} /> : null}
          {canUpload ? <Button label="Edit action" onPress={() => setEditing(true)} /> : null}
        </>
      )}
    </Sheet>
  );
}

function TaskFields({ task, onSaved }: { task: WorkflowTask; onSaved: () => void }) {
  const { organizationId } = useWorkspace();
  const queryClient = useQueryClient();
  const members = useMembers(organizationId);
  const [original] = useState(task);
  const [owner, setOwner] = useState(original.assigned_to_user_id ?? "");
  const [due, setDue] = useState(() => original.due_at ? new Date(original.due_at) : null);
  const [status, setStatus] = useState(original.status);
  const [priority, setPriority] = useState(original.priority);
  const [category, setCategory] = useState(original.category);
  const patch: TaskUpdate = {};
  if (owner !== (original.assigned_to_user_id ?? "")) patch.assigned_to_user_id = owner || null;
  const dueAt = due?.toISOString() ?? null;
  const previousDue = original.due_at ? new Date(original.due_at).toISOString() : null;
  if (dueAt !== previousDue) patch.due_at = dueAt;
  if (status !== original.status) patch.status = status;
  if (priority !== original.priority) patch.priority = priority;
  if (category !== original.category) patch.category = category;
  const save = useMutation({
    mutationFn: (update: TaskUpdate) => api.updateTask(organizationId, original.id, update),
    onSuccess: () => {
      onSaved();
      return invalidateWorkspaceRecords(queryClient, organizationId, "tasks");
    },
  });
  const owners = [
    { value: "", label: "Unassigned" },
    ...(members.data ?? []).map((member) => ({ value: member.user_id, label: member.display_name || member.email })),
  ];
  if (owner && !owners.some((item) => item.value === owner)) {
    owners.push({ value: owner, label: original.assigned_to_name || original.assigned_to_email || "Current owner" });
  }

  return (
    <>
      <Select label="Owner" value={owner} onChange={setOwner} options={owners} disabled={!members.data}
        help={members.error ? "The workspace member list is unavailable." : undefined} />
      {members.error ? <Button label="Retry loading members" variant="secondary" onPress={() => void members.refetch()} /> : null}
      <DateField label="Due" value={due} onChange={setDue} optional />
      <Select label="Status" value={status} onChange={setStatus} options={options(STATUS)} />
      <Select label="Priority" value={priority} onChange={setPriority} options={options(PRIORITY)} />
      <Select label="Type" value={category} onChange={setCategory} options={options(CATEGORY)} />
      <FormError error={save.error} />
      <Button label="Save changes" disabled={!Object.keys(patch).length} loading={save.isPending} onPress={() => save.mutate(patch)} />
    </>
  );
}
