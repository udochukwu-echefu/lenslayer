import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FormScreen } from "@/components/form-screen";
import { AppText, Segmented, Select, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import type { NegotiationItemCategory } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";

const categories: { value: NegotiationItemCategory; label: string }[] = [
  { value: "change", label: "Requested change" }, { value: "commercial", label: "Commercial" }, { value: "legal", label: "Legal" }, { value: "operational", label: "Operational" }, { value: "open_point", label: "Open point" },
];

/** Add a point to the negotiation checklist: what we want, and what they currently offer. */
export default function NewNegotiationItemScreen() {
  const { contractId } = useLocalSearchParams<{ contractId: string }>();
  const { organizationId } = useWorkspace();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<NegotiationItemCategory>("change");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [ours, setOurs] = useState("");
  const [theirs, setTheirs] = useState("");
  const add = useMutation({
    mutationFn: () => api.createNegotiationItem(organizationId, contractId, { title: title.trim(), category, priority, our_position: ours.trim(), counterparty_position: theirs.trim() }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["negotiation-items", organizationId, contractId] }), queryClient.invalidateQueries({ queryKey: ["deal-passport", organizationId, contractId] })]);
      router.back();
    },
  });
  return (
    <FormScreen submitLabel="Add point" onSubmit={() => add.mutate()} disabled={title.trim().length < 2} loading={add.isPending} error={add.error}>
      <TextField label="Point" value={title} onChangeText={setTitle} maxLength={255} placeholder="e.g. Mutual liability cap" autoFocus />
      <Select label="Kind" value={category} onChange={setCategory} options={categories} />
      <TextField label="We want" value={ours} onChangeText={setOurs} multiline maxLength={2000} placeholder="e.g. 12 months’ fees" />
      <TextField label="They offer" value={theirs} onChangeText={setTheirs} multiline maxLength={2000} placeholder="e.g. 24 months’ fees" />
      <AppText variant="smallStrong" tone="muted">Priority</AppText>
      <Segmented label="Priority" value={priority} onChange={setPriority} options={[{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }]} />
    </FormScreen>
  );
}
