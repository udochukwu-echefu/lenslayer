import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FormScreen } from "@/components/form-screen";
import { Segmented, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import type { ContractDecisionName } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";

const hints: Record<ContractDecisionName, string> = {
  accept: "We accept this as written.",
  change: "We want this changed before signing.",
  escalate: "Someone more senior, or counsel, needs to decide.",
  resolve: "This point is settled.",
};

/** Record a human decision about a clause or the whole contract, with the reason. It goes in the decision log under your name. */
export default function NewDecisionScreen() {
  const { contractId, subject: initialSubject } = useLocalSearchParams<{ contractId: string; subject?: string }>();
  const { organizationId } = useWorkspace();
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<ContractDecisionName>("accept");
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [rationale, setRationale] = useState("");
  const save = useMutation({
    mutationFn: () => api.createDecision(organizationId, contractId, { decision, subject: subject.trim(), rationale: rationale.trim() }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["decisions", organizationId, contractId] }), queryClient.invalidateQueries({ queryKey: ["contract-activity", organizationId, contractId] }), queryClient.invalidateQueries({ queryKey: ["deal-passport", organizationId, contractId] })]);
      router.back();
    },
  });
  return (
    <FormScreen submitLabel="Save decision" onSubmit={() => save.mutate()} disabled={subject.trim().length < 2 || rationale.trim().length < 5} loading={save.isPending} error={save.error}
      footnote="Recorded with your name and the time.">
      <Segmented label="Decision" value={decision} onChange={setDecision} options={[{ value: "accept", label: "Accept" }, { value: "change", label: "Change" }, { value: "escalate", label: "Escalate" }, { value: "resolve", label: "Resolve" }]} />
      <TextField label="About" value={subject} onChangeText={setSubject} maxLength={255} placeholder="e.g. Indemnity clause" help={hints[decision]} />
      <TextField label="Why" value={rationale} onChangeText={setRationale} multiline maxLength={4000} placeholder="The reason, in a sentence or two" help="At least 5 characters." />
    </FormScreen>
  );
}
