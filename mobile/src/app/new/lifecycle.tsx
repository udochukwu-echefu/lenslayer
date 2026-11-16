import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FormScreen } from "@/components/form-screen";
import { Chips, DateField, Select, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { titleCase } from "@/lib/format";
import { flatten, invalidateWorkspaceRecords, useContractList, useMembers } from "@/lib/queries";
import type { LifecycleKind, Recurrence } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";

const kinds: { value: LifecycleKind; label: string; verb: string }[] = [
  { value: "renewal", label: "Renewal", verb: "e.g. Renews for 12 months" },
  { value: "notice", label: "Notice", verb: "e.g. Give notice of non-renewal" },
  { value: "payment", label: "Payment", verb: "e.g. Quarterly service fee" },
  { value: "obligation", label: "Obligation", verb: "e.g. Send insurance certificate" },
  { value: "post_signature", label: "Other", verb: "What must happen?" },
];
const reminders = ["0", "7", "14", "30", "90"];
const repeats: Recurrence[] = ["none", "monthly", "quarterly", "yearly"];

/**
 * Add a renewal, notice window, payment or obligation date. Only add dates a
 * person has checked against the agreement: this is what drives reminders.
 * Opened from a contract (contract known) or from Renewals (pick one).
 */
export default function NewLifecycleScreen() {
  const params = useLocalSearchParams<{ contractId?: string }>();
  const { organizationId, user } = useWorkspace();
  const queryClient = useQueryClient();
  const members = useMembers(organizationId);
  const contracts = useContractList(organizationId, { sort: "title", descending: false });
  const [contractId, setContractId] = useState(params.contractId ?? "");
  const [kind, setKind] = useState<LifecycleKind>("notice");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<Date | null>(null);
  const [owner, setOwner] = useState(user?.id ?? "");
  const [remind, setRemind] = useState("14");
  const [repeat, setRepeat] = useState<Recurrence>("none");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: () => api.createLifecycle(organizationId, contractId, {
      kind, title: title.trim(), due_at: due!.toISOString(), owner_user_id: owner || null, reminder_days: Number(remind), recurrence: repeat,
      ...(amount.trim() ? { amount: amount.trim() } : {}), ...(notes.trim() ? { description: notes.trim() } : {}),
    }),
    onSuccess: async () => { await invalidateWorkspaceRecords(queryClient, organizationId, "lifecycle"); router.back(); },
  });

  return (
    <FormScreen submitLabel="Save" onSubmit={() => create.mutate()} disabled={!contractId || title.trim().length < 2 || !due} loading={create.isPending} error={create.error}
      footnote="Add only dates someone has checked against the agreement.">
      <Chips label="Kind of date" value={kind} onChange={setKind} options={kinds.map(({ value, label }) => ({ value, label }))} />
      <TextField label="What must happen?" value={title} onChangeText={setTitle} maxLength={255} placeholder={kinds.find((item) => item.value === kind)?.verb} />
      {!params.contractId ? (
        <Select label="Agreement" value={contractId} onChange={setContractId} help={contracts.hasNextPage ? "Showing the first 25. Open the contract to add a date to any other." : undefined}
          options={flatten(contracts.data).items.map((contract) => ({ value: contract.id, label: contract.title || contract.source_name, description: contract.counterparty || undefined }))} />
      ) : null}
      <DateField label="Date" value={due} onChange={setDue} />
      <Select label="Owner" value={owner} onChange={setOwner}
        options={[{ value: "", label: "Unassigned" }, ...(members.data ?? []).map((member) => ({ value: member.user_id, label: member.display_name || member.email, description: titleCase(member.role) }))]} />
      <Select label="Remind the owner" value={remind} onChange={setRemind} options={reminders.map((value) => ({ value, label: value === "0" ? "On the day" : `${value} days before`, description: value === "90" ? "Good for long notice periods" : undefined }))} />
      <Select label="Repeat" value={repeat} onChange={setRepeat} options={repeats.map((value) => ({ value, label: value === "none" ? "Never" : titleCase(value) }))} />
      {kind === "payment" ? <TextField label="Amount (optional)" value={amount} onChangeText={setAmount} placeholder="e.g. £18,400" maxLength={80} /> : null}
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline maxLength={2000} placeholder="e.g. Recorded delivery to the landlord’s registered office" />
    </FormScreen>
  );
}
