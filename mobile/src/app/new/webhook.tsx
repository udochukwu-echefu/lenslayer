import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { FormScreen } from "@/components/form-screen";
import { OneTimeSecret } from "@/components/one-time-secret";
import { AppText, CheckRow, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

type EventName = "contract.created" | "contract.review_ready" | "contract.review_failed";
const events: { value: EventName; label: string }[] = [
  { value: "contract.created", label: "A contract is uploaded" },
  { value: "contract.review_ready", label: "A review is ready" },
  { value: "contract.review_failed", label: "A review failed" },
];

/** Send workspace events to your own system. Each delivery is signed so the receiver can check it came from LensLayer. */
export default function NewWebhookScreen() {
  const { organizationId } = useWorkspace();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("https://");
  const [description, setDescription] = useState("");
  const [chosen, setChosen] = useState<EventName[]>(["contract.review_ready"]);
  const create = useMutation({
    mutationFn: () => api.createWebhook(organizationId, { target_url: url.trim(), description: description.trim(), events: chosen }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks", organizationId] }),
  });
  if (create.data) {
    return <OneTimeSecret title="Copy the signing secret" description="Use it to verify each delivery came from LensLayer." value={create.data.signing_secret}
      warning="This is the only time the secret is shown. Store it with your other secrets." />;
  }
  const valid = /^https:\/\/[^\s/]+\.[^\s]+$/.test(url.trim());
  return (
    <FormScreen submitLabel="Add webhook" onSubmit={() => create.mutate()} disabled={!valid || !chosen.length} loading={create.isPending} error={create.error} needsEditor={false}>
      <TextField label="Endpoint URL" value={url} onChangeText={setUrl} keyboardType="url" autoCapitalize="none" autoCorrect={false} help="Must use HTTPS." />
      <TextField label="Description (optional)" value={description} onChangeText={setDescription} maxLength={255} placeholder="e.g. Matter management sync" />
      <View>
        <AppText variant="smallStrong" tone="muted">Send when</AppText>
        {events.map((event) => (
          <CheckRow key={event.value} label={event.label} checked={chosen.includes(event.value)}
            onChange={(checked) => setChosen(checked ? [...chosen, event.value] : chosen.filter((value) => value !== event.value))} />
        ))}
      </View>
    </FormScreen>
  );
}
