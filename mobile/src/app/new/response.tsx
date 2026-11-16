import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FormScreen } from "@/components/form-screen";
import { Select, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

const channels = ["Email", "Call", "Meeting", "Marked-up document", "Message"].map((value) => ({ value, label: value }));

/** Log what the other side said, so the negotiation record doesn't live in someone's inbox. */
export default function NewResponseScreen() {
  const { contractId } = useLocalSearchParams<{ contractId: string }>();
  const { organizationId } = useWorkspace();
  const queryClient = useQueryClient();
  const [who, setWho] = useState("");
  const [channel, setChannel] = useState("Email");
  const [body, setBody] = useState("");
  const log = useMutation({
    mutationFn: () => api.createCounterpartyResponse(organizationId, contractId, { responder_name: who.trim(), channel, body: body.trim() }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["counterparty-responses", organizationId, contractId] }), queryClient.invalidateQueries({ queryKey: ["deal-passport", organizationId, contractId] })]);
      router.back();
    },
  });
  return (
    <FormScreen submitLabel="Log response" onSubmit={() => log.mutate()} disabled={body.trim().length < 2} loading={log.isPending} error={log.error}>
      <TextField label="Who responded" value={who} onChangeText={setWho} maxLength={255} placeholder="Name at the counterparty" autoFocus />
      <Select label="How" value={channel} onChange={setChannel} options={channels} />
      <TextField label="What they said" value={body} onChangeText={setBody} multiline maxLength={8000} placeholder="Summarise or paste their response" />
    </FormScreen>
  );
}
