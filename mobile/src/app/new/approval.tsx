import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FormScreen } from "@/components/form-screen";
import { DateField, Select, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { titleCase } from "@/lib/format";
import { useMembers } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";

/** Ask someone to sign off, optionally with conditions they must tick before approving. */
export default function NewApprovalScreen() {
  const { contractId } = useLocalSearchParams<{ contractId: string }>();
  const { organizationId, user } = useWorkspace();
  const queryClient = useQueryClient();
  const members = useMembers(organizationId);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [approver, setApprover] = useState("");
  const [conditions, setConditions] = useState("");
  const [due, setDue] = useState<Date | null>(null);
  const request = useMutation({
    mutationFn: () => api.createApproval(organizationId, contractId, {
      title: title.trim(), note: note.trim(), assigned_to_user_id: approver || null,
      conditions: conditions.split("\n").map((line) => line.trim()).filter(Boolean), due_at: due ? due.toISOString() : null,
    }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["approvals", organizationId, contractId] }), queryClient.invalidateQueries({ queryKey: ["deal-passport", organizationId, contractId] })]);
      router.back();
    },
  });
  return (
    <FormScreen submitLabel="Request approval" onSubmit={() => request.mutate()} disabled={title.trim().length < 2} loading={request.isPending} error={request.error}>
      <TextField label="What needs approving?" value={title} onChangeText={setTitle} maxLength={255} placeholder="e.g. Approve signing with the liability change" autoFocus />
      <Select label="Approver" value={approver} onChange={setApprover}
        options={[{ value: "", label: "Any owner or admin" }, ...(members.data ?? []).filter((member) => member.user_id !== user?.id).map((member) => ({ value: member.user_id, label: member.display_name || member.email, description: titleCase(member.role) }))]} />
      <TextField label="Conditions (optional)" value={conditions} onChangeText={setConditions} multiline placeholder={"One per line, e.g.\nLiability cap at 12 months’ fees\nSchedule C attached and reviewed"} help="The approver ticks each one before deciding." />
      <DateField label="Needed by" value={due} onChange={setDue} optional />
      <TextField label="Note (optional)" value={note} onChangeText={setNote} multiline maxLength={2000} />
    </FormScreen>
  );
}
